# 4. feladat — SOAP bemenet hibakezeléssel és dead-letter queue-val

## Komponensek

| Szolgáltatás              | Szerep                                                                            |
| ------------------------- | --------------------------------------------------------------------------------- |
| `rabbitmq`                | RabbitMQ broker (management UI: http://localhost:15672, guest/guest)              |
| `soap-gateway`            | SOAP végpont (`http://localhost:8080/wsdl?wsdl`), továbbítja a `colorExchange`-be |
| `soap-client`             | 1 mp-enként véletlen színt küld a SOAP gateway-nek                                |
| `consumer-red/green/blue` | Csak a saját színüket dolgozzák fel, ~30% hiba-szimuláció                         |
| `statistics-reporter`     | A `colorStatistics` queue-ról olvas                                               |
| `dead-letter-reporter`    | A `colorDLQ` queue-ról olvas (RabbitMQ DLX-en keresztül érkező üzenetek)          |

## Üzenettopológia (broker oldalon konfigurált DLX)

- `colorExchange` (direct) — routing key = szín (`RED`/`GREEN`/`BLUE`)
- `colorQueue.RED|GREEN|BLUE` — bind a megfelelő routing key-re,
  `x-dead-letter-exchange = colorDlx`, `x-dead-letter-routing-key = <szín>`
- `colorDlx` (direct) — DLX
- `colorDLQ` — minden színre bindelve a `colorDlx`-en
- `colorStatistics` — sikeres feldolgozási statisztika

A consumer nem publikál külön hibasorba: `nack(msg, false, false)`-szal
elutasítja az üzenetet, és a RabbitMQ a queue-ra konfigurált DLX alapján
automatikusan a `colorDLQ`-ba teszi.

## Indítás

```bash
docker compose up --build
```

Leállítás:

```bash
docker compose down -v
```

## Konfigurálható környezeti változók

| Változó        | Hol                 | Alapérték                            |
| -------------- | ------------------- | ------------------------------------ |
| `RABBITMQ_URL` | minden node service | `amqp://rabbitmq:5672`               |
| `PORT`         | `soap-gateway`      | `8080`                               |
| `GATEWAY_URL`  | `soap-client`       | `http://soap-gateway:8080/wsdl?wsdl` |
| `INTERVAL_MS`  | `soap-client`       | `1000`                               |
| `COLOR`        | consumer            | `RED` / `GREEN` / `BLUE`             |
| `FAILURE_RATE` | consumer            | `0.3`                                |
| `STATS_BATCH`  | consumer            | `10`                                 |

## Manuális SOAP teszt (pl. curl-lal)

```bash
curl -s -X POST http://localhost:8080/wsdl \
  -H 'Content-Type: text/xml; charset=utf-8' \
  -H 'SOAPAction: "http://example.com/color/SendColor"' \
  --data '<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:c="http://example.com/color">
  <soapenv:Body>
    <c:SendColorRequest><c:color>RED</c:color></c:SendColorRequest>
  </soapenv:Body>
</soapenv:Envelope>'
```

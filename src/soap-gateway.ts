import http from "http";
import { listen } from "soap";
import { assertTopology, COLOR_EXCHANGE, COLORS, Color, connectWithRetry } from "./rabbit";

const WSDL = `<?xml version="1.0" encoding="UTF-8"?>
<definitions name="ColorService"
  targetNamespace="http://example.com/color"
  xmlns:tns="http://example.com/color"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns="http://schemas.xmlsoap.org/wsdl/">

  <types>
    <xsd:schema targetNamespace="http://example.com/color">
      <xsd:element name="SendColorRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="color" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
      <xsd:element name="SendColorResponse">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="status" type="xsd:string"/>
            <xsd:element name="message" type="xsd:string"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>

  <message name="SendColorInput">
    <part name="parameters" element="tns:SendColorRequest"/>
  </message>
  <message name="SendColorOutput">
    <part name="parameters" element="tns:SendColorResponse"/>
  </message>

  <portType name="ColorPortType">
    <operation name="SendColor">
      <input message="tns:SendColorInput"/>
      <output message="tns:SendColorOutput"/>
    </operation>
  </portType>

  <binding name="ColorBinding" type="tns:ColorPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="SendColor">
      <soap:operation soapAction="http://example.com/color/SendColor"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="ColorService">
    <port name="ColorPort" binding="tns:ColorBinding">
      <soap:address location="http://localhost:8080/wsdl"/>
    </port>
  </service>
</definitions>`;

async function main() {
  const port = Number(process.env.PORT ?? 8080);
  const conn = await connectWithRetry();
  const ch = await conn.createChannel();
  await assertTopology(ch);
  console.log("[gateway] connected to RabbitMQ, topology asserted");

  const service = {
    ColorService: {
      ColorPort: {
        SendColor: (args: { color?: string }) => {
          const raw = (args?.color ?? "").toString().trim().toUpperCase();
          if (!COLORS.includes(raw as Color)) {
            console.log(`[gateway] rejected invalid color="${args?.color}"`);
            return {
              status: "ERROR",
              message: `Invalid color "${args?.color}". Allowed: ${COLORS.join(", ")}`,
            };
          }
          const color = raw as Color;
          const ok = ch.publish(
            COLOR_EXCHANGE,
            color,
            Buffer.from(JSON.stringify({ color, ts: new Date().toISOString() })),
            { persistent: true, contentType: "application/json" }
          );
          if (!ok) {
            console.log(`[gateway] publish buffer full for ${color}`);
          }
          console.log(`[gateway] SOAP -> queued ${color}`);
          return { status: "OK", message: `Queued ${color}` };
        },
      },
    },
  };

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(404);
    res.end("404: Not Found: " + req.url);
  });

  server.listen(port, () => {
    listen(server, "/wsdl", service, WSDL, () => {
      console.log(`[gateway] SOAP service listening on http://0.0.0.0:${port}/wsdl?wsdl`);
    });
  });
}

main().catch((err) => {
  console.error("[gateway] fatal:", err);
  process.exit(1);
});

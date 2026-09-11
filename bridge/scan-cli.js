import { SerialPort } from "serialport";
import { Bus } from "./bus.js";

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};

const ports = await SerialPort.list();
if (ports.length === 0) {
  console.error("No serial adapters found. Is the U2D2 plugged in?");
  process.exit(1);
}
console.log("Serial adapters:");
for (const p of ports) console.log(`  ${p.path}  ${p.manufacturer ?? ""} ${p.serialNumber ?? ""}`);

const path = arg("port", ports[0].path);
const bauds = (arg("bauds", "57600,1000000,115200,2000000") ?? "").split(",").map(Number);

const bus = new Bus();
console.log(`\nScanning ${path} at ${bauds.join(", ")} baud (IDs 1-20, protocol 1 and 2)...\n`);
const found = await bus.scan({
  path,
  bauds,
  maxId: Number(arg("maxId", 20)),
  onProgress: (p) => p.stage === "baud-done" && console.log(`  ...${p.baud} baud done`),
});
await bus.close();

if (found.length === 0) {
  console.log("\nNo servos answered. Check power, the TTL cable and the baud rates.");
} else {
  console.log("\nFound:");
  for (const f of found)
    console.log(`  ID ${f.id}  ${f.model}  protocol ${f.protocol}  ${f.baud} baud`);
}
process.exit(0);

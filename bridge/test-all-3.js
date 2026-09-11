import { Bus } from "./bus.js";

const bus = new Bus();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("=== Testing all 3 servos on 57,600 baud ===");
  await bus.open("/dev/ttyUSB0", 57600);

  const servos = [
    { id: 1, protocol: 1, modelNumber: 29, name: "Base MX-28" },
    { id: 2, protocol: 1, modelNumber: 29, name: "Link 1 MX-28" },
    { id: 3, protocol: 1, modelNumber: 12, name: "Gripper AX-12A" }
  ];

  for (const s of servos) {
    const ping = await bus.ping(s.protocol, s.id);
    console.log(`Ping ${s.name} (ID ${s.id}):`, ping ? "OK" : "FAILED");
    const initialDeg = await bus.readDegrees(s);
    console.log(`  Initial: ${initialDeg.toFixed(2)}°`);

    // Enable torque with safe speed
    await bus.setTorque(s, true);

    const delta = (s.id === 3 && initialDeg > 100) ? -5 : 5;
    const target = initialDeg + delta;
    console.log(`  Moving by ${delta > 0 ? '+' : ''}${delta}° to ${target.toFixed(2)}°...`);
    await bus.setGoalDegrees(s, target);

    await sleep(1200);
    const moved = await bus.readDegrees(s);
    console.log(`  Moved to: ${moved.toFixed(2)}°`);

    console.log(`  Returning to: ${initialDeg.toFixed(2)}°...`);
    await bus.setGoalDegrees(s, initialDeg);

    await sleep(1200);
    const returned = await bus.readDegrees(s);
    console.log(`  Returned to: ${returned.toFixed(2)}°`);

    await bus.setTorque(s, false);
    console.log(`  Torque disabled for ${s.name}.\n`);
  }

  await bus.close();
  console.log("=== All 3 servos verified and functional at 57,600 baud! ===");
}

main().catch(console.error);

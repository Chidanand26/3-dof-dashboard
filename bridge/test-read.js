import { Bus } from "./bus.js";

const bus = new Bus();

async function test() {
  console.log("=== Testing 57600 baud (MX-28 servos) ===");
  await bus.open("/dev/ttyUSB0", 57600);
  
  for (const id of [1, 2]) {
    const servo = { id, protocol: 1, modelNumber: 29 };
    const ping = await bus.ping(1, id);
    console.log(`Servo ID ${id} ping:`, ping);
    if (ping) {
      const state = await bus.readState(servo);
      console.log(`Servo ID ${id} state:`, state);
    }
  }
  await bus.close();

  console.log("\n=== Testing 1000000 baud (AX-12A servo) ===");
  await bus.open("/dev/ttyUSB0", 1000000);
  const servo3 = { id: 3, protocol: 1, modelNumber: 12 };
  const ping3 = await bus.ping(1, 3);
  console.log("Servo ID 3 ping:", ping3);
  if (ping3) {
    const state3 = await bus.readState(servo3);
    console.log("Servo ID 3 state:", state3);
  }
  await bus.close();
}

test().catch(console.error);

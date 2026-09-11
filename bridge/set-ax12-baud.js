import { Bus } from "./bus.js";
import { writePacket } from "./protocol.js";

const bus = new Bus();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setBaud() {
  console.log("Connecting at 1,000,000 baud to configure AX-12A (ID 3)...");
  await bus.open("/dev/ttyUSB0", 1000000);
  
  const pingBefore = await bus.ping(1, 3);
  console.log("Ping at 1,000,000 baud:", pingBefore);
  if (!pingBefore) {
    console.log("Could not ping at 1M baud. Checking if already at 57600 baud...");
    await bus.close();
    await bus.open("/dev/ttyUSB0", 57600);
    const ping57k = await bus.ping(1, 3);
    console.log("Ping at 57,600 baud:", ping57k);
    await bus.close();
    return;
  }

  // Ensure torque is OFF before writing EEPROM
  const servo = { id: 3, protocol: 1, modelNumber: 12 };
  await bus.setTorque(servo, false);
  await sleep(100);

  // Address 4 in AX-12A is Baud Rate. Value 34 (0x22) is 57,600 baud.
  console.log("Writing 34 (57,600 baud) to EEPROM address 4 on ID 3...");
  const pkt = writePacket(1, 3, 4, 34, 1);
  await bus.txrx(1, pkt, undefined, 100);

  await bus.close();
  await sleep(300);

  console.log("Testing ping at 57,600 baud...");
  await bus.open("/dev/ttyUSB0", 57600);
  const pingAfter = await bus.ping(1, 3);
  console.log("Ping at 57,600 baud result:", pingAfter);
  
  if (pingAfter) {
    const state = await bus.readState(servo);
    console.log("Servo ID 3 readState at 57600 baud:", state);
    console.log("SUCCESS! AX-12A is now configured to 57,600 baud!");
  } else {
    console.error("Failed to ping at 57,600 baud.");
  }
  await bus.close();
}

setBaud().catch(console.error);

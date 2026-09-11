import { Bus } from "./bus.js";

const bus = new Bus();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function testMotion() {
  console.log("=== Testing MX-28 Servos (ID 1 & 2) at 57600 baud ===");
  await bus.open("/dev/ttyUSB0", 57600);

  for (const id of [1, 2]) {
    const servo = { id, protocol: 1, modelNumber: 29 };
    console.log(`\n--- Testing Servo ID ${id} ---`);
    const initialDeg = await bus.readDegrees(servo);
    console.log(`Initial position: ${initialDeg.toFixed(2)}°`);

    // Set gentle moving speed (~4.5 RPM)
    console.log("Setting gentle speed (movingSpeed = 40)...");
    await bus.writeValue(servo, "movingSpeed", 40);

    console.log("Enabling torque...");
    await bus.setTorque(servo, true);

    const targetDelta = 5; // move by 5 degrees
    const targetDeg = initialDeg + targetDelta;
    console.log(`Moving to target: ${targetDeg.toFixed(2)}° (+${targetDelta}°)...`);
    await bus.setGoalDegrees(servo, targetDeg);

    await sleep(1500);
    const movedDeg = await bus.readDegrees(servo);
    console.log(`Measured position after move: ${movedDeg.toFixed(2)}°`);

    console.log(`Moving back to initial: ${initialDeg.toFixed(2)}°...`);
    await bus.setGoalDegrees(servo, initialDeg);

    await sleep(1500);
    const returnedDeg = await bus.readDegrees(servo);
    console.log(`Measured position after return: ${returnedDeg.toFixed(2)}°`);

    console.log("Disabling torque...");
    await bus.setTorque(servo, false);
  }

  await bus.close();

  console.log("\n=== Testing AX-12A Servo (ID 3) at 1000000 baud ===");
  await bus.open("/dev/ttyUSB0", 1000000);
  const servo3 = { id: 3, protocol: 1, modelNumber: 12 };
  console.log("\n--- Testing Servo ID 3 ---");
  const initialDeg3 = await bus.readDegrees(servo3);
  console.log(`Initial position: ${initialDeg3.toFixed(2)}°`);

  console.log("Setting gentle speed (movingSpeed = 40)...");
  await bus.writeValue(servo3, "movingSpeed", 40);

  console.log("Enabling torque...");
  await bus.setTorque(servo3, true);

  // If initial is 134.8°, target 130° is safe within range
  const targetDeg3 = initialDeg3 > 0 ? initialDeg3 - 5 : initialDeg3 + 5;
  console.log(`Moving to target: ${targetDeg3.toFixed(2)}°...`);
  await bus.setGoalDegrees(servo3, targetDeg3);

  await sleep(1500);
  const movedDeg3 = await bus.readDegrees(servo3);
  console.log(`Measured position after move: ${movedDeg3.toFixed(2)}°`);

  console.log(`Moving back to initial: ${initialDeg3.toFixed(2)}°...`);
  await bus.setGoalDegrees(servo3, initialDeg3);

  await sleep(1500);
  const returnedDeg3 = await bus.readDegrees(servo3);
  console.log(`Measured position after return: ${returnedDeg3.toFixed(2)}°`);

  console.log("Disabling torque...");
  await bus.setTorque(servo3, false);

  await bus.close();
  console.log("\n=== Test completed successfully ===");
}

testMotion().catch(console.error);

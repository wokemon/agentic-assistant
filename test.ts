import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  try {
    const num1Str = await askQuestion("Enter first number: ");
    const num1 = parseFloat(num1Str);
    if (isNaN(num1)) {
      console.log("Invalid number");
      return;
    }

    const num2Str = await askQuestion("Enter second number: ");
    const num2 = parseFloat(num2Str);
    if (isNaN(num2)) {
      console.log("Invalid number");
      return;
    }

    const operation = await askQuestion("Enter operation (+, -, *, /): ");

    let result: number;
    switch (operation) {
      case "+":
        result = num1 + num2;
        break;
      case "-":
        result = num1 - num2;
        break;
      case "*":
        result = num1 * num2;
        break;
      case "/":
        if (num2 === 0) {
          console.log("Error: Division by zero");
          return;
        }
        result = num1 / num2;
        break;
      default:
        console.log("Invalid operation");
        return;
    }

    console.log(`Result: ${num1} ${operation} ${num2} = ${result}`);
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    rl.close();
  }
}

main();

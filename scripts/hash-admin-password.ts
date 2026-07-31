import { hashPassword } from "@/lib/admin/password";

async function readPipedPassword() {
  process.stdin.setEncoding("utf8");
  let password = "";

  for await (const chunk of process.stdin) {
    password += chunk;
  }

  return password.replace(/\r?\n$/, "");
}

function readHiddenPassword() {
  return new Promise<string>((resolve, reject) => {
    const input = process.stdin;
    const output = process.stderr;
    const wasRaw = input.isRaw;
    let password = "";
    let escapeSequence = false;

    const cleanup = () => {
      input.off("data", handleData);
      input.setRawMode(wasRaw);
      input.pause();
      output.write("\n");
    };

    const handleData = (chunk: string | Buffer) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Password hashing cancelled."));
          return;
        }

        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(password);
          return;
        }

        if (character === "\u001b") {
          escapeSequence = true;
          continue;
        }

        if (escapeSequence) {
          if (/^[A-Za-z~]$/.test(character)) {
            escapeSequence = false;
          }
          continue;
        }

        if (character === "\u0008" || character === "\u007f") {
          if (password) {
            password = [...password].slice(0, -1).join("");
            output.write("\b \b");
          }
          continue;
        }

        if (character >= " ") {
          password += character;
          output.write("*");
        }
      }
    };

    output.write("Password (input hidden): ");
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", handleData);
  });
}

async function main() {
  if (process.argv.length > 2) {
    console.error(
      "Do not pass plaintext passwords as command-line arguments. Run `pnpm admin:hash-password` and use the hidden prompt or pipe the value on stdin.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    const password = process.stdin.isTTY
      ? await readHiddenPassword()
      : await readPipedPassword();
    console.log(await hashPassword(password));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unable to hash password.");
    process.exitCode = 1;
  }
}

void main();

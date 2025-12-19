// frontend/entrypoint.mjs

import { spawn } from "child_process";

// --- Configuration ---
const DEFAULT_VITE_PORT = 5173;
const DEFAULT_VITE_HOST = "localhost"; // Default: only accessible locally

// --- Options Parsing and Logic ---

/**
 * Parses command-line arguments and returns an options object.
 * @returns {{expose: boolean, port: number | undefined, help: boolean}}
 */
function parseOptions() {
    const args = process.argv.slice(2);
    const options = {
        expose: false,
        port: undefined,
        help: false,
    };
    const validFlags = ["-x", "--expose", "-p", "--port", "-h", "--help"];
    let i = 0;

    while (i < args.length) {
        const arg = args[i];

        if (arg === "-x" || arg === "--expose") {
            options.expose = true;
        } else if (arg === "-h" || arg === "--help") {
            options.help = true;
        } else if (arg === "-p" || arg === "--port") {
            // Check if the next argument is the port number
            const portValue = args[i + 1];
            if (portValue && !portValue.startsWith("-")) {
                const port = parseInt(portValue, 10);
                if (port > 0 && port < 65536) {
                    options.port = port;
                    i++; // Skip the port value
                } else {
                    console.error(`\n[ERROR] Invalid port value provided: ${portValue}`);
                    showHelp(true); // Show help and exit on invalid port
                }
            } else {
                console.error("\n[ERROR] The --port (-p) option requires a port number.\n");
                showHelp(true);
            }
        } else if (arg.startsWith("-")) {
            // Handle invalid/unknown option
            console.error(`\n[ERROR] Invalid option: ${arg}`);
            showHelp(true);
        }
        i++;
    }

    return options;
}

/**
 * Displays the help message in a binary/CLI style.
 * @param {boolean} exit - Whether to exit the process after showing the message.
 */
function showHelp(exit = false) {
    const helpMessage = `
Usage: node entrypoint.mjs [options]

Starts the adblock proxy and the Vite development server.

Options:
  -x, --expose <host>       Exposes the Vite server to the network (sets host to '0.0.0.0').
                            The adblock proxy is always bound to 0.0.0.0.
  -p, --port <number>       Specifies the port for the Vite development server.
                            (Default: ${DEFAULT_VITE_PORT})
  -h, --help                Show this help message.

`;
    console.log(helpMessage);
    if (exit) {
        process.exit(1);
    }
}


// --- Main Execution ---

const options = parseOptions();

if (options.help) {
    showHelp();
    process.exit(0);
}

// 1. Start Adblock Proxy
console.log("[boot] starting adblock proxy...");
spawn("node", ["adblock/server.mjs"], {
    stdio: "inherit",
    cwd: process.cwd(),
});


// 2. Start Vite
console.log("[boot] starting vite...");

const viteArgs = ["run", "dev"];

if (options.expose) {
    // If --expose is set, Vite must be configured to use 0.0.0.0 host
    viteArgs.push("--", "--host", "0.0.0.0");
    console.log(`[vite] binding to host: 0.0.0.0`);
} else {
    console.log(`[vite] binding to host: ${DEFAULT_VITE_HOST}`);
}

if (options.port) {
    // If --port is set, append the port argument
    // Use --port directly or ensure it's passed correctly to the underlying Vite command
    // assuming 'npm run dev' runs something like 'vite --port <number>'
    if (!options.expose) {
        // If --expose wasn't already added, add '--' to separate npm/script args from vite args
        viteArgs.push("--");
    }
    viteArgs.push("--port", options.port.toString());
    console.log(`[vite] binding to port: ${options.port}`);
} else {
    console.log(`[vite] binding to port: ${DEFAULT_VITE_PORT}`);
}


// The 'npm run dev' command typically needs the extra '--' to pass arguments through
// to the underlying script (like Vite), but we already handled that with the host/port logic above.

spawn("npm", viteArgs, {
    stdio: "inherit",
    cwd: process.cwd()
});


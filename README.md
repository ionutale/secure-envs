# KDBX Env Loader

A secure environment variable loader that reads secrets directly from a KeePass (`.kdbx`) file and injects them into a command's process environment. This allows you to run applications without storing secrets in plain text `.env` files.

## Features

- **Secure**: Secrets are read from the encrypted database into memory and injected directly into the child process. They are never written to disk.
- **Flexible**: Works with any command (`npm run dev`, `node server.js`, etc.).
- **Specific**: Only loads the variables you explicitly request.

## Prerequisites

- Node.js (v16 or higher recommended)
- A `.kdbx` database file (KeePass format)

## Installation & Build

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Build the project**:
   ```bash
   npm run build
   ```

## Usage

The tool is designed to wrap your execution command. You provide the database file and the list of variables you need.

### CLI Syntax

```bash
node dist/cli.js --file <path/to/db.kdbx> --vars <VAR1> <VAR2> ... -- <command_to_run>
```

### Arguments

- `--file`, `-f`: Path to your `.kdbx` file.
- `--vars`, `-v`: Space-separated list of variable names to load.
- `--keyfile`, `-k`: (Optional) Path to a key file if your database uses one.
- `--`: Separator indicating the end of loader options and the start of your command.

### Environment Setup in KeePass

For the tool to find your variables:
1. Create an entry in your KeePass database.
2. Set the **Title** of the entry to the environment variable name (e.g., `DATABASE_URL`).
3. Set the **Password** field to the value of the variable.

### Example

Suppose you have a database `secure-environments.kdbx` containing an entry with Title `DATABASE_URL`.

To run your dev server with this variable:

```bash
node dist/cli.js --file secure-environments.kdbx --vars DATABASE_URL -- npm run dev
```

The tool will:
1. Prompt you for the database password.
2. Decrypt the database and find the entry with Title `DATABASE_URL`.
3. Start `npm run dev` with `DATABASE_URL` set in its environment.

## Integration with package.json

You can simplify usage by adding a script to your `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "dev:secure": "node dist/cli.js --file ./secrets.kdbx --vars DATABASE_URL API_KEY -- npm run dev"
}
```

Now you can just run `npm run dev:secure`.

## Authentication

Since `.kdbx` files are encrypted, you must provide credentials to unlock them.

### Interactive Prompt (Default)
If you do not provide a password via environment variables, the tool will **automatically prompt** you to enter it securely in the command line.

### Environment Variable (CI/CD)
To bypass the prompt (for scripts or CI/CD), set the `KDBX_PASSWORD` variable:

```bash
export KDBX_PASSWORD="super-secret-password"
node dist/cli.js ...
```

### Key Files
If your database uses a key file, provide it with the `--keyfile` (or `-k`) option:

```bash
node dist/cli.js --file secrets.kdbx --keyfile secrets.key ...
```

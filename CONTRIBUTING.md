# Contributing

Thanks for your interest in contributing to PlayCanvas Visual Graph Editor. I'm happy to have you here.

Please take a moment to review this document before submitting your first pull request. I also strongly recommend that you check for open issues and pull requests to see if someone else is working on something similar.

## Development

### Fork and Clone

1.  Fork this repository.
2.  Clone your fork:
    ```bash
    git clone https://github.com/rhanlin/playcanvas-graph-editor.git
    ```
3.  Navigate to the project directory:
    ```bash
    cd playcanvas-graph-editor
    ```

### Install Dependencies

I use [pnpm](https://pnpm.io) for dependency management.

```bash
pnpm install
```

### Development Workflow

1.  **Make changes** to the codebase.

2.  **Build the extension**:

    ```bash
    pnpm build
    ```

    This will generate the `dist` folder.

3.  **Load/Reload in Chrome**:
    - Open `chrome://extensions/`
    - Enable "Developer mode".
    - Click "Load unpacked" and select the `dist` folder.
    - After making subsequent changes and rebuilding, click the **Reload** icon on the extension card to apply updates.

### Testing

I use [Vitest](https://vitest.dev) for testing.

```bash
pnpm test
```

> **Note:** Current test coverage is limited (mostly covering state management). Adding tests for new features is highly appreciated but not strictly required for this initial version.

## Commit Convention

Before you create a Pull Request, please check whether your commits comply with the commit conventions used in this repository.

I follow the convention `category(scope): message`.

**Categories:**

- `feat`: New features
- `fix`: Bug fixes
- `refactor`: Code changes that neither fix a bug nor add a feature
- `docs`: Documentation changes
- `build`: Build system or dependency changes
- `test`: Adding or updating tests
- `chore`: Other changes (maintenance, config, etc.)

**Example:**
`feat(graph): add support for collapsing multiple nodes`

## Pull Requests

1.  **Fork and Branch**: Create a new branch for your feature or fix from `main`.
2.  **Make Changes**: Implement your changes.
3.  **Verify**: Run the build and test commands to ensure everything works.
4.  **Submit PR**: Open a Pull Request against the `main` branch.
    - Provide a clear description of what the PR does.
    - Reference any related issues (e.g., `Fixes #123`).

## Code of Conduct

Please be respectful and considerate in all interactions. I aim to build a welcoming community for everyone.

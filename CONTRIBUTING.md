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

### Project Structure

Here's an overview of the project structure to help you get oriented:

```
src
├── components
│   ├── graph-editor     # React Flow graph components (nodes, canvas)
│   ├── script-attributes # Specialized attribute editors (CurvePicker, ColorPicker, etc.)
│   └── ui               # Shared UI components (Input, Slider, etc.)
├── content
│   └── index.ts         # Chrome Extension content script (injected into page)
├── stores               # Zustand state management
├── utils                # Helper functions (runtime comms, graph layout)
└── types                # TypeScript type definitions
```

- **`src/content/index.ts`**: The entry point for the content script. It injects the `editor-bridge.js` into the PlayCanvas Editor page to establish communication.
- **`public/editor-bridge.js`**: This script is injected directly into the web page's context.
  - **Role**: It acts as a bridge between the Chrome Extension and the PlayCanvas Editor's internal API (`window.editor`).
  - **Functionality**: Accesses scene graph data, listens for editor events (selection, updates), and handles commands from the extension (like reparenting or updating attributes).
  - **Communication**: Uses `window.postMessage` to send data back to `content/index.ts`.
- **`src/stores/useGraphEditorStore.ts`**: The central store managing the application state (nodes, edges, selection, etc.).
- **`src/components/script-attributes/TypeHandlers.tsx`**: The registry for attribute type handlers (Strategy Pattern), determining how different attribute types are rendered.

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

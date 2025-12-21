# PlayCanvas Visual Graph Editor

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)
![React](https://img.shields.io/badge/React-18.3-blue.svg)
![Vite](https://img.shields.io/badge/Vite-4.5-blue.svg)

A Chrome Extension for PlayCanvas that transforms scene management with a visual node graph and advanced attribute editors.

![Demo](public/images/pc-graph-editor.webp)

## Features

- **Visual Scene Graph**: Interactive node-based view of your Entity hierarchy with drag-and-drop support.
- **Advanced Attribute Editors**:
  - **Curve Picker**: Full-featured animation curve editor.
  - **Color Picker**: Enhanced RGBA color selection.
  - **Visual Selectors**: Connection lines for Entity and Asset references.
- **Bi-directional Sync**: Real-time synchronization with PlayCanvas Editor.
- **Live Updates**: Instantly reflects selection, property changes, and structural updates.

## Installation

1.  **Clone the repository**

    ```bash
    git clone https://github.com/rhanlin/playcanvas-graph-editor.git
    cd playcanvas-graph-editor
    ```

2.  **Install dependencies**

    ```bash
    pnpm install
    ```

3.  **Build the extension**

    ```bash
    pnpm build
    ```

4.  **Load into Chrome**
    - Open `chrome://extensions/`
    - Enable "Developer mode".
    - Click "Load unpacked" and select the `dist` folder.

## Usage

1.  Open your PlayCanvas Editor project.
2.  Open Chrome Developer Tools (F12 or Cmd+Option+I).
3.  Navigate to the **Graph Editor** tab.
4.  **Interact**:
    - **Pan/Zoom**: Navigate the graph space.
    - **Select**: Click nodes to select entities in the main Editor.
    - **Edit**: Expand nodes to use the enhanced attribute editors.

## Tech Stack

- **Core**: React 18, TypeScript, Vite
- **Graph**: React Flow
- **State**: Zustand
- **Styling**: Tailwind CSS, @playcanvas/pcui

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.

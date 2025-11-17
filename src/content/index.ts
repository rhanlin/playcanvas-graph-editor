import type { GraphDataPayload, GraphEdgePayload, GraphNodePayload } from '@/types/messaging'

type EditorEntity = {
  get: (path: string) => any
}

const randomId = () => Math.random().toString(36).slice(2, 10)

function buildGraphData(entity: EditorEntity): GraphDataPayload {
  const entityName = entity.get('name') || 'Unnamed Entity'
  const entityId = entity.get('resource_id') || entity.get('resourceId') || randomId()
  const basePosition = { x: 50, y: 50 }

  const nodes: GraphNodePayload[] = [
    {
      id: `entity-${entityId}`,
      nodeType: 'entity',
      label: entityName,
      position: basePosition,
    },
  ]

  const edges: GraphEdgePayload[] = []

  const scripts = entity.get('components.script.scripts') || {}
  const scriptNames = Object.keys(scripts)
  scriptNames.forEach((scriptName, index) => {
    const nodeId = `entity-${entityId}-script-${scriptName}-${index}`
    const scriptNode: GraphNodePayload = {
      id: nodeId,
      nodeType: 'script',
      label: scriptName,
      scriptName,
      scriptAttributes: scripts[scriptName]?.attributes || {},
      position: {
        x: basePosition.x + 320,
        y: basePosition.y + index * 180,
      },
    }

    nodes.push(scriptNode)
    edges.push({
      id: `edge-${entityId}-${scriptName}-${index}`,
      source: `entity-${entityId}`,
      target: nodeId,
    })
  })

  return {
    entityName,
    nodes,
    edges,
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GRAPH_REQUEST_DATA') {
    try {
      const editor = (window as { editor?: any }).editor
      if (!editor) {
        sendResponse({ success: false, error: 'PlayCanvas editor not detected' })
        return true
      }

      const selection = editor.call?.('selector:items') || []
      if (!selection.length) {
        sendResponse({
          success: true,
          data: {
            entityName: 'No entity selected',
            nodes: [],
            edges: [],
          },
        })
        return true
      }

      const entity = selection[0]
      const payload = buildGraphData(entity)
      sendResponse({ success: true, data: payload })
    } catch (error) {
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      })
    }
    return true
  }

  return false
})


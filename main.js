'use strict';
// === Canvas Card Merger（自動組裝，勿手改；改 main_shell.js / merge_core.js 後重跑 assemble_plugin.py）===
const { Plugin, Notice } = require('obsidian');

// ===== 內聯引擎 merge_core.js（逐字，與獨立黃金測試版位元一致）=====
/**
 * merge_core.js - Canvas Card Merger Core Engine
 * CommonJS, Zero Dependencies, Node 20 compatible.
 */

/**
 * Merges nodes in an Obsidian .canvas object into a single Markdown string.
 * @param {Object} canvasObj - Parsed .canvas JSON: { nodes: [...], edges: [...] }
 * @param {string[]|null|undefined} selectedIds - IDs of nodes to merge. If null/undefined, merges all.
 * @returns {string} Markdown result
 */
function mergeCanvas(canvasObj, selectedIds) {
  // 1. Defensively handle null/undefined or empty nodes
  if (!canvasObj || !Array.isArray(canvasObj.nodes) || canvasObj.nodes.length === 0) {
    return "";
  }

  // Define helper to parse numbers defensively
  const parseNum = (v) => {
    if (v === undefined || v === null) return 0;
    const num = Number(v);
    return isNaN(num) ? 0 : num;
  };

  // Convert nodes list and parse values defensively
  const allNodes = canvasObj.nodes
    .filter(n => n && typeof n === 'object')
    .map(n => {
      const id = n.id !== undefined && n.id !== null ? String(n.id) : '';
      const type = n.type !== undefined && n.type !== null ? String(n.type) : '';
      
      return {
        id,
        type,
        x: parseNum(n.x),
        y: parseNum(n.y),
        width: parseNum(n.width),
        height: parseNum(n.height),
        text: n.text !== undefined && n.text !== null ? String(n.text) : '',
        file: n.file !== undefined && n.file !== null ? String(n.file) : '',
        url: n.url !== undefined && n.url !== null ? String(n.url) : '',
        label: n.label !== undefined && n.label !== null ? String(n.label) : ''
      };
    })
    .filter(n => n.id !== '');

  // 2. Identify the active nodes (selection set)
  let activeNodes = allNodes;
  if (selectedIds !== null && selectedIds !== undefined) {
    const idsToKeep = new Set(
      (Array.isArray(selectedIds) ? selectedIds : [])
        .map(id => id !== undefined && id !== null ? String(id) : '')
        .filter(id => id !== '')
    );
    activeNodes = allNodes.filter(n => idsToKeep.has(n.id));
  }

  if (activeNodes.length === 0) {
    return "";
  }

  const activeIdsSet = new Set(activeNodes.map(n => n.id));

  // 3. Clean and parse edges defensively
  const rawEdges = Array.isArray(canvasObj.edges) ? canvasObj.edges : [];
  const cleanEdges = rawEdges
    .filter(e => e && typeof e === 'object')
    .map(e => ({
      id: e.id !== undefined && e.id !== null ? String(e.id) : '',
      fromNode: e.fromNode !== undefined && e.fromNode !== null ? String(e.fromNode) : '',
      toNode: e.toNode !== undefined && e.toNode !== null ? String(e.toNode) : ''
    }))
    .filter(e => e.fromNode !== '' && e.toNode !== '' && activeIdsSet.has(e.fromNode) && activeIdsSet.has(e.toNode));

  // 4. Resolve parent-child relationships for nested groups
  const activeGroups = activeNodes.filter(n => n.type === 'group');

  // Sort groups by area ascending to resolve hierarchical nesting (smallest group is innermost)
  const sortedGroupsAsc = [...activeGroups].sort((a, b) => {
    return (a.width * a.height) - (b.width * b.height);
  });

  const containsCenter = (g, n) => {
    const cx = n.x + n.width / 2;
    const cy = n.y + n.height / 2;
    return cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height;
  };

  const nodeParent = {}; // nodeId -> parentGroupId
  const childrenMap = {}; // groupId -> array of active children
  
  activeNodes.forEach(n => {
    childrenMap[n.id] = [];
  });

  const getArea = (node) => node.width * node.height;

  activeNodes.forEach(n => {
    // Find the smallest active group (excluding itself) containing n's center
    const parentGroup = sortedGroupsAsc.find(g => {
      if (g.id === n.id) return false;
      if (n.type === 'group') {
        const aG = getArea(g);
        const aN = getArea(n);
        if (aG < aN) return false;
        if (aG === aN && g.id <= n.id) return false;
      }
      return containsCenter(g, n);
    });
    if (parentGroup) {
      nodeParent[n.id] = parentGroup.id;
      childrenMap[parentGroup.id].push(n);
    }
  });

  // Calculate nesting depth for each group recursively with safety cycle protection
  const groupDepth = {};
  const getDepth = (id, visiting = new Set()) => {
    if (groupDepth[id] !== undefined) return groupDepth[id];
    if (visiting.has(id)) {
      groupDepth[id] = 0;
      return 0;
    }
    visiting.add(id);
    const pid = nodeParent[id];
    if (!pid) {
      groupDepth[id] = 0;
    } else {
      groupDepth[id] = getDepth(pid, visiting) + 1;
    }
    visiting.delete(id);
    return groupDepth[id];
  };

  activeGroups.forEach(g => getDepth(g.id));

  // Identify root-level nodes (nodes with no active parent group)
  const rootNodes = activeNodes.filter(n => !nodeParent[n.id]);

  // Geometric ordering helper: y-ascending first; if same (diff < 1), x-ascending; if still same, back to id ascending
  const geomCompare = (a, b) => {
    const diffY = a.y - b.y;
    if (Math.abs(diffY) < 1) {
      const diffX = a.x - b.x;
      if (diffX === 0) {
        return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
      }
      return diffX;
    }
    return diffY;
  };

  // 5. Sibling sorting engine
  function sortNodes(nodesList) {
    if (nodesList.length <= 1) {
      return [...nodesList];
    }

    // Rule: "group 之間與 group 外節點按幾何序混排。"
    // If there is any group node inside nodesList, sort purely geometrically
    const hasGroup = nodesList.some(n => n.type === 'group');
    if (hasGroup) {
      return [...nodesList].sort(geomCompare);
    }

    // Now nodesList consists purely of non-group nodes.
    // Check if there are edges connecting nodes in nodesList
    const nodesInListSet = new Set(nodesList.map(n => n.id));
    const listEdges = cleanEdges.filter(e => nodesInListSet.has(e.fromNode) && nodesInListSet.has(e.toNode));

    // If no edges, fallback to pure geometric sort
    if (listEdges.length === 0) {
      return [...nodesList].sort(geomCompare);
    }

    // Build undirected adjacency list for Weakly Connected Components (WCC)
    const undirAdj = {};
    nodesList.forEach(n => {
      undirAdj[n.id] = [];
    });
    listEdges.forEach(e => {
      undirAdj[e.fromNode].push(e.toNode);
      undirAdj[e.toNode].push(e.fromNode);
    });

    const visited = new Set();
    const components = [];

    nodesList.forEach(n => {
      if (!visited.has(n.id)) {
        const comp = [];
        const queue = [n.id];
        visited.add(n.id);

        while (queue.length > 0) {
          const curr = queue.shift();
          const nodeObj = nodesList.find(x => x.id === curr);
          if (nodeObj) {
            comp.push(nodeObj);
          }

          const neighbors = undirAdj[curr] || [];
          neighbors.forEach(nbr => {
            if (!visited.has(nbr)) {
              visited.add(nbr);
              queue.push(nbr);
            }
          });
        }
        components.push(comp);
      }
    });

    // Sort each component using Kahn's topological sort algorithm
    const sortedComponents = [];
    let cycleDetected = false;

    for (const comp of components) {
      const compNodeIds = new Set(comp.map(n => n.id));
      const compInDegree = {};
      const compAdj = {};

      comp.forEach(n => {
        compInDegree[n.id] = 0;
        compAdj[n.id] = [];
      });

      listEdges.forEach(e => {
        if (compNodeIds.has(e.fromNode) && compNodeIds.has(e.toNode)) {
          compAdj[e.fromNode].push(e.toNode);
          compInDegree[e.toNode]++;
        }
      });

      // Find starting nodes with in-degree 0
      let queue = comp.filter(n => compInDegree[n.id] === 0);
      // Deterministically sort multiple starting nodes by geometric order
      queue.sort(geomCompare);

      const compSorted = [];
      while (queue.length > 0) {
        const u = queue.shift();
        compSorted.push(u);

        const neighbors = compAdj[u.id] || [];
        for (const vId of neighbors) {
          compInDegree[vId]--;
          if (compInDegree[vId] === 0) {
            const vNode = comp.find(x => x.id === vId);
            if (vNode) {
              queue.push(vNode);
              queue.sort(geomCompare);
            }
          }
        }
      }

      // If Kahn's sort did not visit all nodes in this component, a cycle exists
      if (compSorted.length < comp.length) {
        cycleDetected = true;
        break;
      }

      sortedComponents.push({
        comp,
        sorted: compSorted
      });
    }

    // Route back to pure geometric sort if a cycle is detected ("環：整體退回純幾何排序，不得丟節點")
    if (cycleDetected) {
      return [...nodesList].sort(geomCompare);
    }

    // Sort components among each other using the geometric order of their most top nodes
    const componentWithTopNode = sortedComponents.map(item => {
      const topNode = [...item.comp].sort(geomCompare)[0];
      return {
        topNode,
        sorted: item.sorted
      };
    });

    componentWithTopNode.sort((a, b) => geomCompare(a.topNode, b.topNode));

    // Flatten and return the results
    const finalSorted = [];
    componentWithTopNode.forEach(item => {
      finalSorted.push(...item.sorted);
    });
    return finalSorted;
  }

  // 6. Block-rendering helper
  function renderNode(node) {
    if (node.type === 'text') {
      // (2026-06-16) External image embeds are passed through verbatim (see README safety note).
      // Silently rewriting them mutilates the user's own content for a fetch risk that already
      // exists in the canvas itself; honest docs beat a partial, surprising sanitizer.
      const txt = node.text;
      const pId = nodeParent[node.id];
      if (pId) {
        const parentLevel = Math.min(2 + (groupDepth[pId] || 0), 6);
        const lines = txt.split(/\r?\n/).map(line => {
          const match = line.match(/^(#{1,6})\s/);
          if (match) {
            const k = match[1].length;
            const newLevel = Math.min(k + parentLevel, 6);
            return '#'.repeat(newLevel) + line.slice(k);
          }
          return line;
        });
        return [lines.join('\n')];
      }
      return [txt];
    } else if (node.type === 'file') {
      return [`![[${node.file}]]`];
    } else if (node.type === 'link') {
      return [node.url];
    } else if (node.type === 'group') {
      const hLevel = Math.min(2 + (groupDepth[node.id] || 0), 6);
      const headingPrefix = '#'.repeat(hLevel);
      const headingLabel = node.label.trim() ? node.label.trim() : 'Group';
      const headingLine = `${headingPrefix} ${headingLabel}`;

      const children = childrenMap[node.id] || [];
      const sortedChildren = sortNodes(children);

      const blocks = [headingLine];
      sortedChildren.forEach(c => {
        blocks.push(...renderNode(c));
      });
      return blocks;
    }
    return [];
  }

  // 7. Sort and recursively render root-level nodes
  const sortedRootNodes = sortNodes(rootNodes);
  const finalBlocks = [];
  sortedRootNodes.forEach(node => {
     finalBlocks.push(...renderNode(node));
  });

  // 8. Join blocks with a single empty line
  return finalBlocks.join("\n\n");
}

// ===== 插件殼 =====
module.exports = class CanvasCardMergerPlugin extends Plugin {
  onload() {
    this.addCommand({
      id: "merge-canvas-to-note",
      name: "Merge canvas to note",
      callback: async () => {
        try {
          const file = this.app.workspace.getActiveFile();
          if (!file || file.extension !== "canvas") {
            new Notice("請先開啟一個 Canvas");
            return;
          }
          let data;
          try {
            const raw = await this.app.vault.read(file);
            if (!raw || !raw.trim()) {
              // 剛建未寫入的新 canvas 檔案是空的（非合法 JSON）；當「空畫布」處理，別說「無法解析」嚇人（2026-06-16 實機煙霧）
              new Notice("這個 Canvas 是空的，沒有可合併的內容（未建立任何檔案）。", 6000);
              return;
            }
            data = JSON.parse(raw);
          } catch (e) {
            new Notice("合併失敗：無法讀取或解析這個 Canvas。你的畫布與既有筆記都沒有被更動。", 8000);
            return;
          }
          const md = mergeCanvas(data, null);
          if (!md || !md.trim()) {
            new Notice("這個 Canvas 是空的，沒有可合併的內容（未建立任何檔案）。", 6000);
            return;
          }
          const stem = file.path.slice(0, -7);
          let outPath = stem + " (merged).md";
          if (this.app.vault.getAbstractFileByPath(outPath)) {
            let counter = 2;
            while (true) {
              const testPath = `${stem} (merged ${counter}).md`;
              if (!this.app.vault.getAbstractFileByPath(testPath)) {
                outPath = testPath;
                break;
              }
              counter++;
            }
          }
          await this.app.vault.create(outPath, md);
          new Notice("已合併為筆記：" + outPath, 4000);
        } catch (e) {
          new Notice("合併失敗：你的畫布與既有筆記都沒有被更動。（" + e.message + "）", 8000);
        }
      }
    });
  }
};

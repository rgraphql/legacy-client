// Import here Polyfills if needed. Recommended core-js (npm i -D core-js)
// import "core-js/fn/array.find"
// ...

import { QueryTreeNode } from './query-tree'

// Client implements a soyuz client.
export default class Client {
  private queryTree: QueryTreeNode = new QueryTreeNode()
}

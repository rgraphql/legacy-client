import { PathCursor } from './path-cursor'
import { PathCache } from './path-cache'
import { QueryTree } from '../query-tree/query-tree'
import { ResultTreeNode } from './result-tree-node'
import { ResultTreeHandler } from './result-tree-handler'
import { Query } from '../query-tree/query'
import { rgraphql } from 'rgraphql'

// IAttachedHandler is an attached query tree handler.
interface IAttachedHandler {
  handler: ResultTreeHandler
  cursors: PathCursor[]
  flush?: () => void
}

// IAttachedCursor is an attached result cursor.
interface IAttachedCursor {
  resultTreeNode: ResultTreeNode
  cursors: PathCursor[]
}

// ResultTree stores a RGQLValue result space.
// Subscribes to the "query node disposed" event stream.
// The minimum depth disposed node is emitted on that channel (only).
// ResultTree stores the []RGQLValue series.
export class ResultTree {
  private cursor: PathCursor | null = null
  private pathCache: PathCache
  private root: ResultTreeNode
  private rootCursor: PathCursor
  private handlers: IAttachedHandler[] = []
  private cachedCursors: IAttachedCursor[] = []

  constructor(
    private qtree: QueryTree,
    cacheStrategy: rgraphql.RGQLValueInit.CacheStrategy,
    cacheSize: number
  ) {
    if (cacheStrategy !== rgraphql.RGQLValueInit.CacheStrategy.CACHE_LRU) {
      throw new Error('unsupported cache strategy: ' + cacheStrategy)
    }

    this.root = new ResultTreeNode({})
    this.rootCursor = new PathCursor(qtree.getRoot(), this.root)
    this.pathCache = new PathCache(cacheSize, this.handleCursorEvict.bind(this))
  }

  // reset resets the result tree and state.
  public reset() {
    this.cachedCursors.length = 0
    this.handlers.length = 0
    this.root.children.length = 0
    this.rootCursor.resultHandlers.length = 0
    this.rootCursor.outOfBounds = false
    this.pathCache.reset()
    this.cursor = null
  }

  // handleValue handles an incoming value.
  // This must be called in-order.
  // If an error is thrown, behavior is then undefined.
  public handleValue(val: rgraphql.IRGQLValue) {
    let isFirst = !this.cursor
    if (isFirst) {
      let posID = val.posIdentifier
      if (posID) {
        let posIDCursor = this.pathCache.get(posID)
        if (!posIDCursor) {
          throw new Error('unknown position id referenced: ' + posID)
        }

        this.cursor = posIDCursor.clone()
        delete val.posIdentifier
        return
      }

      this.cursor = this.rootCursor.clone()
    }

    if (!this.cursor) {
      throw new Error('expected non-null cursor')
    }

    this.cursor.apply(val)
    let nPosID = val.posIdentifier
    if (nPosID) {
      this.pathCache.set(nPosID, this.cursor.clone())
    }
  }

  // addResultHandler adds a result handler and calls it for all existing data that matches.
  public addResultHandler(handler: ResultTreeHandler, flush?: () => void) {
    this.handlers.push({ handler, cursors: [], flush })
    this.rootCursor.resultHandlers.push(handler)
    this.root.callHandler(handler, (rtn: ResultTreeNode, rth: ResultTreeHandler) => {
      let attachedCursors: PathCursor[] | undefined
      for (let cPair of this.cachedCursors) {
        if (cPair.resultTreeNode === rtn) {
          attachedCursors = cPair.cursors
          break
        }
      }

      if (!attachedCursors) {
        return
      }

      for (let hPair of this.handlers) {
        if (hPair.handler === rth) {
          hPair.cursors.concat(attachedCursors)
          for (let cursor of hPair.cursors) {
            cursor.resultHandlers.push(rth)
          }
          break
        }
      }
    })
  }

  // flushHandlers calls flush on each handler
  public flushHandlers() {
    for (let handler of this.handlers) {
      if (handler.flush) {
        handler.flush()
      }
    }
  }

  // removeResultHandler removes a result handler from the result tree.
  public removeResultHandler(handler: ResultTreeHandler) {
    let hPair: IAttachedHandler | undefined
    for (let i = 0; i < this.handlers.length; i++) {
      if (this.handlers[i].handler === handler) {
        hPair = this.handlers[i]
        this.handlers[i] = this.handlers[this.handlers.length - 1]
        this.handlers.splice(this.handlers.length - 1, 1)
        break
      }
    }

    if (!hPair) {
      return
    }

    const rmFromResultHandlers = (rhs: ResultTreeHandler[]) => {
      for (let i = 0; i < rhs.length; i++) {
        if (rhs[i] === handler) {
          rhs[i] = rhs[rhs.length - 1]
          rhs.splice(rhs.length - 1, 1)
          break
        }
      }
    }

    for (let cursor of hPair.cursors) {
      rmFromResultHandlers(cursor.resultHandlers)
    }
    rmFromResultHandlers(this.rootCursor.resultHandlers)
  }

  // handleCursorEvict handles when a cursor is removed from the cache.
  private handleCursorEvict(cursor: PathCursor) {
    this.purgeCursor(cursor)
  }

  // purgeCursor purges the cursor from the rnode set
  private purgeCursor(cursor: PathCursor) {
    if (cursor.rnode) {
      // Purge the cursor from the rnode set.
      for (let i = 0; i < this.cachedCursors.length; i++) {
        let cachedCursor = this.cachedCursors[i]
        if (cachedCursor.resultTreeNode === cursor.rnode) {
          // remove cursor from the set
          for (let ci = 0; ci < cachedCursor.cursors.length; ci++) {
            if (cachedCursor.cursors[ci] === cursor) {
              cachedCursor.cursors[ci] = cachedCursor.cursors[cachedCursor.cursors.length - 1]
              cachedCursor.cursors.splice(cachedCursor.cursors.length - 1, 1)
              break
            }
          }
          if (cachedCursor.cursors.length === 0) {
            this.cachedCursors[i] = this.cachedCursors[this.cachedCursors.length - 1]
            this.cachedCursors.splice(this.cachedCursors.length - 1, 1)
          }
          break
        }
      }
    }

    for (let handler of cursor.resultHandlers) {
      for (let handlerPair of this.handlers) {
        if (handlerPair.handler === handler) {
          for (let ri = 0; ri < handlerPair.cursors.length; ri++) {
            if (handlerPair.cursors[ri] === cursor) {
              handlerPair.cursors[ri] = handlerPair.cursors[handlerPair.cursors.length - 1]
              handlerPair.cursors.splice(handlerPair.cursors.length - 1, 1)
              break
            }
          }
          break
        }
      }
    }
  }
}

import { Observable } from 'rxjs/Observable';
import { Observer } from 'rxjs/Observer';
import { Subscription } from 'rxjs/Subscription';
import { Subject } from 'rxjs/Subject';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { ISoyuzClientContext } from './interfaces';
import {
  Query,
  QueryError,
} from './query-tree/query';
import { QueryTreeNode } from './query-tree/query-tree';
import { ValueTreeNode } from './value-tree';
import {
  OperationDefinitionNode,
  DocumentNode,
} from 'graphql';

import * as _ from 'lodash';

// An error in the input query.
export type QueryError = QueryError;

// Result / ongoing status of a query.
export type QueryResult<T> = {
  data: T;
  errors: QueryError[];
};

// Options when starting a query.
export interface IQueryOptions {
  // The parsed query.
  query: DocumentNode;
  // Data to fill variables with.
  variables?: { [name: string]: any };
}

interface ISoyuzQueryContext {
  valueTree: ValueTreeNode;
}

// An observable query.
export class ObservableQuery<T> extends Observable<QueryResult<T>> {
  // Any observers listening to this query's result.
  private observers: Observer<QueryResult<T>>[];
  // AST
  private ast: OperationDefinitionNode;
  // Variables
  private variables: { [name: string]: any };
  // The current context behavior subject.
  private queryContext: BehaviorSubject<ISoyuzQueryContext>;
  // The query tree reference.
  private queryTree: QueryTreeNode;
  // The query in the query tree.
  private query: Query;
  // Any handles we should clear when dropping this.query.
  private querySubHandles: Subscription[];
  // Result data storage
  private lastResult: QueryResult<T>;
  // Client context subject
  private clientContext: BehaviorSubject<ISoyuzClientContext>;

  constructor(clientContext: BehaviorSubject<ISoyuzClientContext>,
              queryTree: QueryTreeNode,
              ast: OperationDefinitionNode,
                variables: { [name: string]: any }) {
    // Initialize the Observable<T>
    const subscriberFn = (observer: Observer<QueryResult<T>>) => {
      return this.onSubscribe(observer);
    };
    super(subscriberFn);

    this.queryTree = queryTree;
    this.clientContext = clientContext;
    this.queryContext = new BehaviorSubject<ISoyuzQueryContext>(null);
    this.ast = ast;
    this.variables = variables || {};
    this.observers = [];
    this.querySubHandles = [];
    this.lastResult = {
      data: <any>{},
      errors: [],
    };
    window['lastResult'] = this.lastResult;
  }

  private onSubscribe(observer: Observer<QueryResult<T>>) {
    this.observers.push(observer);

    if (observer.next) {
      observer.next(this.lastResult);
    }

    if (this.observers.length === 1) {
      this.initQuery();
    }

    return {
      unsubscribe: () => {
        let idx = this.observers.indexOf(observer);
        if (idx === -1) {
          return;
        }

        this.observers.splice(idx, 1);
        if (this.observers.length === 0) {
          this.cancelQuery();
        }
      },
    };
  }

  // Apply this query to the query tree and begin resolution.
  private initQuery() {
    if (this.query) {
      return;
    }

    // Note: this asserts OperationDefinition is a query.
    this.query = this.queryTree.buildQuery(this.ast, this.variables);
    this.querySubHandles.push(this.query.errors.subscribe((errArr) => {
      this.lastResult.errors = errArr;
      this.emitResult();
    }));

    this.querySubHandles.push(this.clientContext.subscribe((ctx) => {
      let currentQueryContext = this.queryContext.value;
      let hasObservers = this.observers.length;
      if (!ctx || !ctx.valueTree) {
        if (currentQueryContext) {
          this.queryContext.next(null);
        }
        return;
      }
      if (currentQueryContext &&
            currentQueryContext.valueTree === ctx.valueTree) {
        return;
      }
      let nctx: ISoyuzQueryContext = {
        valueTree: ctx.valueTree,
      };
      this.queryContext.next(nctx);
      let sub = this.hookValueTree(ctx.valueTree).subscribe(_.debounce((val: any) => {
        this.emitResult();
      }, 10, {maxWait: 100}));
      let subb = this.queryContext.subscribe((rctx) => {
        if (rctx !== nctx) {
          sub.unsubscribe();
          subb.unsubscribe();
        }
      });
    }));
  }

  // Traverse the value tree and register new hooks.
  private hookValueTree(vtree: ValueTreeNode,
                        parentVal: any = this.lastResult.data,
                        parentIdxMarker: any[] = []): Subject<void> {
    let context = this.queryContext.value;
    if (!context || context.valueTree !== vtree.root) {
      return;
    }

    let changed = new Subject<void>();
    let subHandles: Subscription[] = [];
    let cleanupFuncs: (() => void)[] = [];
    let qnode = vtree.queryNode;
    let cleanup = () => {
      for (let sh of subHandles) {
        sh.unsubscribe();
      }
      subHandles.length = 0;
      for (let cu of cleanupFuncs) {
        cu();
      }
    };
    let reevaluate = () => {
      cleanup();
      let hvt = this.hookValueTree(vtree, parentVal, parentIdxMarker);
      if (hvt) {
        hvt.subscribe(() => {
          changed.next();
        });
      }
    };
    subHandles.push(this.queryContext.subscribe((ctx) => {
      if (!ctx || ctx.valueTree !== vtree.root) {
        cleanup();
      }
    }));

    // If we're not interested in this query node, subscribe in case we become interested.
    if (!qnode.queries[this.query.id]) {
      let shand = qnode.queryAdded.subscribe((query: Query) => {
        if (query === this.query) {
          reevaluate();
        }
      });
      subHandles.push(shand);
      return null;
    }

    // Handle what happens if we remove this query (lose interest).
    subHandles.push(qnode.queryRemoved.subscribe((query: Query) => {
      if (query === this.query) {
        reevaluate();
      }
    }));

    let fieldName = qnode.queriesAlias[this.query.id] || qnode.fieldName;
    let isArray = vtree.isArray;

    // console.log(`Qtree (${qnode.id})[${fieldName}] -> isArray: ${isArray}`);

    let pv: any;
    let pvChildIdxMarker: any[];
    let pvIdxMarker: any = {};

    if (qnode.id === 0 || !fieldName) {
      pv = parentVal;
    } else if (isArray) {
      pv = [];
      pvChildIdxMarker = [];
    } else {
      pv = {};
    }

    if (qnode.id !== 0) {
      if (typeof parentVal === 'object' && parentVal.constructor !== Array) {
        parentVal[fieldName] = pv;
        cleanupFuncs.push(() => {
          if (!parentVal.hasOwnProperty(fieldName)) {
            return;
          }
          delete parentVal[fieldName];
          changed.next();
        });
        subHandles.push(vtree.value.subscribe((val) => {
          if (!parentVal.hasOwnProperty(fieldName) || (val === undefined)) {
            return;
          }
          parentVal[fieldName] = val;
          changed.next();
        }));
      } else {
        parentVal.push(pv);
        parentIdxMarker.push(pvIdxMarker);
        cleanupFuncs.push(() => {
          let idx = parentIdxMarker.indexOf(pvIdxMarker);
          if (idx === -1) {
            return;
          }
          parentVal.splice(idx, 1);
          parentIdxMarker.splice(idx, 1);
          changed.next();
        });
        subHandles.push(vtree.value.subscribe((val) => {
          if (val === undefined) {
            return;
          }
          let idx = parentIdxMarker.indexOf(pvIdxMarker);
          if (idx === -1) {
            return;
          }
          parentVal[idx] = val;
          changed.next();
        }));
      }
    }

    let addChild = (child: ValueTreeNode) => {
      let cqnode = child.queryNode;
      let childSubj = this.hookValueTree(child, pv, pvChildIdxMarker);
      if (childSubj) {
        childSubj.subscribe(() => {
          changed.next();
        });
      }
    };

    for (let child of vtree.children) {
      addChild(child);
    }
    vtree.childAdded.subscribe((vchild: ValueTreeNode) => {
      addChild(vchild);
    });

    subHandles.push(vtree.value.subscribe(null, null, () => {
      cleanup();
    }));

    return changed;
  }

  private cancelQuery() {
    if (this.query) {
      for (let hand of this.querySubHandles) {
        hand.unsubscribe();
      }
      this.querySubHandles.length = 0;
      this.query.unsubscribe();
      this.query = null;
    }
    if (this.queryContext.value) {
      this.queryContext.next(null);
    }
  }

  private emitResult() {
    for (let obs of this.observers) {
      if (obs.next) {
        obs.next(this.lastResult);
      }
    }
  }

  // Forcibly dispose the query and clear the observers.
  private dispose(reason?: any) {
    this.cancelQuery();
    for (let obs of this.observers) {
      if (reason && obs.error) {
        obs.error(reason);
      } else if (obs.complete) {
        obs.complete();
      }
    }
    this.observers.length = 0;
  }
}

import { QueryTreeNode } from './query-tree';
import { ValueTreeNode } from './value-tree';
import { ITransport } from './transport';
import { ISoyuzClientContext } from './interfaces';
import { ClientBus } from './client-bus';
import {
  ObservableQuery,
  IQueryOptions,
} from './query';
import { parse, OperationDefinitionNode } from 'graphql';
import { simplifyQueryAst } from './util/graphql';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';

// Soyuz client.
export class SoyuzClient {
  private queryTree: QueryTreeNode;
  private context = new BehaviorSubject<ISoyuzClientContext>(null);
  private transportIdCounter = 0;

  constructor() {
    this.queryTree = new QueryTreeNode();
    this.initHandlers();
  }

  // Set transport causes the client to start using a new transport to talk to the server.
  // Pass null to stop using the previous transport.
  public setTransport(transport: ITransport) {
    if (this.context.value && this.context.value.transport === transport) {
      return;
    }

    if (!transport) {
      this.context.next(null);
      return;
    }

    let tid: number = this.transportIdCounter++;
    let vtr = new ValueTreeNode(this.queryTree);
    let clib = new ClientBus(transport, this.queryTree, vtr);
    this.context.next({
      transport: transport,
      valueTree: vtr,
      clientBus: clib,
    });
  }

  // Build a query against the system.
  public query<T>(options: IQueryOptions): ObservableQuery<T> {
    if (!options || !options.query) {
      throw new Error('You must specify a options object and query.');
    }
    let nast = simplifyQueryAst(options.query);
    let odef: OperationDefinitionNode;
    for (let def of nast.definitions) {
      if (def.kind === 'OperationDefinition') {
        odef = def;
      }
    }
    if (!odef) {
      throw new Error('Your provided query document did not contain a query definition.');
    }
    return new ObservableQuery<T>(this.context,
                                  this.queryTree,
                                  odef,
                                  options.variables);
  }

  private initHandlers() {
    let lastContext: ISoyuzClientContext;
    this.context.subscribe((ctx) => {
      if (lastContext) {
        lastContext.valueTree.dispose();
        lastContext.clientBus.dispose();
      }

      lastContext = ctx;
    });
  }
}

import { rgraphql } from 'rgraphql'

// QueryTreeHandler handles changes to the query tree.
export type QueryTreeHandler = (mut: rgraphql.IRGQLQueryTreeMutation) => void

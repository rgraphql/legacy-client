import { rgraphql } from 'rgraphql'

// HandleResultValue handles the next value in the sequence, optionally
// returning a handler for the next value(s) in the sequence.
export type ResultTreeHandler = ((val: rgraphql.IRGQLValue) => ResultTreeHandler) | null

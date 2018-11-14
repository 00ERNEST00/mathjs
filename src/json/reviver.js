'use strict'

import { factory } from '../utils/factory'

const name = 'json.reviver'
const dependencies = ['type', 'expression.node']

// TODO: refactor createReviver factory to accept just a single object with types
export const createReviver = factory(name, dependencies, ({ type, expression: { node } }) => {
  /**
   * Instantiate mathjs data types from their JSON representation
   * @param {string} key
   * @param {*} value
   * @returns {*} Returns the revived object
   */
  return function reviver (key, value) {
    const constructor = type[value && value.mathjs] || (node && node[value && value.mathjs])
    // TODO: instead of checking math.expression.node, expose all Node classes on math.type too

    if (constructor && typeof constructor.fromJSON === 'function') {
      return constructor.fromJSON(value)
    }

    return value
  }
})

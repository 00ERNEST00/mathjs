'use strict'

import { factory } from '../../utils/factory'
import { getSafeProperty } from '../../utils/customs'

const name = 'help'
const dependencies = ['typed', 'scope', 'expression.docs', 'type.Help']

export const createHelp = factory(name, dependencies, ({ typed, scope, expression: { docs }, type: { Help } }) => {
  /**
   * Retrieve help on a function or data type.
   * Help files are retrieved from the documentation in math.expression.docs.
   *
   * Syntax:
   *
   *    math.help(search)
   *
   * Examples:
   *
   *    console.log(math.help('sin').toString())
   *    console.log(math.help(math.add).toString())
   *    console.log(math.help(math.add).toJSON())
   *
   * @param {Function | string | Object} search   A function or function name
   *                                              for which to get help
   * @return {Help} A help object
   */
  return typed(name, {
    'any': function (search) {
      let prop
      let searchName = search

      if (typeof search !== 'string') {
        for (prop in scope) {
          // search in functions and constants
          if (scope.hasOwnProperty(prop) && (search === scope[prop])) {
            searchName = prop
            break
          }
        }

        /* TODO: implement help for data types
         if (!text) {
         // search data type
         for (prop in math.type) {
         if (math.type.hasOwnProperty(prop)) {
         if (search === math.type[prop]) {
         text = prop
         break
         }
         }
         }
         }
         */
      }

      const doc = getSafeProperty(docs, searchName)
      if (!doc) {
        throw new Error('No documentation found on "' + searchName + '"')
      }
      return new Help(doc)
    }
  })
})

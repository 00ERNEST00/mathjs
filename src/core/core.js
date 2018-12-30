'use strict'

import './../utils/polyfills'
import { isLegacyFactory } from './../utils/object'
import { createTyped } from './function/typed'
import * as emitter from './../utils/emitter'
import { importFactory } from './function/import'
import { configFactory } from './function/config'
import { factory, isFactory } from '../utils/factory'
import {
  isAccessorNode,
  isArray,
  isArrayNode,
  isAssignmentNode,
  isBigNumber,
  isBlockNode,
  isBoolean,
  isChain,
  isComplex,
  isConditionalNode,
  isConstantNode,
  isDate,
  isDenseMatrix,
  isFraction,
  isFunction,
  isFunctionAssignmentNode,
  isFunctionNode,
  isHelp,
  isIndex,
  isIndexNode,
  isMatrix,
  isNode,
  isNull,
  isNumber,
  isObject,
  isObjectNode,
  isOperatorNode,
  isParenthesisNode,
  isRange,
  isRangeNode,
  isRegExp,
  isResultSet,
  isSparseMatrix,
  isString,
  isSymbolNode,
  isUndefined,
  isUnit
} from '../utils/is'

const dependencies = [ 'config' ]

/**
 * Math.js core. Creates a new, empty math.js instance
 * @param {Object} config     Available options:
 *                            {number} epsilon
 *                              Minimum relative difference between two
 *                              compared values, used by all comparison functions.
 *                            {string} matrix
 *                              A string 'Matrix' (default) or 'Array'.
 *                            {string} number
 *                              A string 'number' (default), 'BigNumber', or 'Fraction'
 *                            {number} precision
 *                              The number of significant digits for BigNumbers.
 *                              Not applicable for Numbers.
 *                            {boolean} predictable
 *                              Predictable output type of functions. When true,
 *                              output type depends only on the input types. When
 *                              false (default), output type can vary depending
 *                              on input values. For example `math.sqrt(-4)`
 *                              returns `complex('2i')` when predictable is false, and
 *                              returns `NaN` when true.
 *                            {string} randomSeed
 *                              Random seed for seeded pseudo random number generator.
 *                              Set to null to randomly seed.
 * @returns {Object} Returns a bare-bone math.js instance containing
 *                   functions:
 *                   - `import` to add new functions
 *                   - `config` to change configuration
 *                   - `on`, `off`, `once`, `emit` for events
 */
export const createCore = factory('core', dependencies, ({ config }) => {
  // simple test for ES5 support
  if (typeof Object.create !== 'function') {
    throw new Error('ES5 not supported by this JavaScript engine. ' +
    'Please load the es5-shim and es5-sham library for compatibility.')
  }

  // create the mathjs instance
  const math = emitter.mixin({})

  // load config function and apply provided config
  const _config = config // keep internal _config private
  math.config = configFactory(_config, math.emit)

  math.expression = {
    transform: {},
    mathWithTransform: {
      config: math.config
    }
  }

  math.type = {
    // only here for backward compatibility for legacy factory functions
    isNumber,
    isComplex,
    isBigNumber,
    isFraction,
    isUnit,
    isString,
    isArray,
    isMatrix,
    isDenseMatrix,
    isSparseMatrix,
    isRange,
    isIndex,
    isBoolean,
    isResultSet,
    isHelp,
    isFunction,
    isDate,
    isRegExp,
    isObject,
    isNull,
    isUndefined,

    isAccessorNode,
    isArrayNode,
    isAssignmentNode,
    isBlockNode,
    isConditionalNode,
    isConstantNode,
    isFunctionAssignmentNode,
    isFunctionNode,
    isIndexNode,
    isNode,
    isObjectNode,
    isOperatorNode,
    isParenthesisNode,
    isRangeNode,
    isSymbolNode,

    isChain
  }

  // create a new typed instance
  math.typed = createTyped({
    config: math.config,

    // (lazily) link to the factory functions (they may not exist, or may not exist yet)
    bignumber: (x) => {
      if (!math.bignumber) {
        throw new Error(`Cannot convert value ${x} into a BigNumber: factory function 'math.bignumber' missing`)
      }

      return math.bignumber(x)
    },
    complex: (x) => {
      if (!math.complex) {
        throw new Error(`Cannot convert value ${x} into a Complex number: factory function 'math.complex' missing`)
      }

      return math.complex(x)
    },
    fraction: (x) => {
      if (!math.fraction) {
        throw new Error(`Cannot convert value ${x} into a Fraction: factory function 'math.fraction' missing`)
      }

      return math.fraction(x)
    },
    matrix: (x) => {
      if (!math.fraction) {
        throw new Error(`Cannot convert array into a Matrix: factory function 'math.matrix' missing`)
      }

      return math.matrix(x)
    }
  })

  // cached factories and instances used by function load
  const legacyFactories = []
  const legacyInstances = []

  /**
   * Load a function or data type from a factory.
   * If the function or data type already exists, the existing instance is
   * returned.
   * @param {Function} factory
   * @returns {*}
   */
  function load (factory) {
    if (isFactory(factory)) {
      return factory(math)
    }

    const firstProperty = factory[Object.keys(factory)[0]]
    if (isFactory(firstProperty)) {
      return firstProperty(math)
    }

    if (!isLegacyFactory(factory)) {
      console.warn('Factory object with properties `type`, `name`, and `factory` expected', factory)
      throw new Error('Factory object with properties `type`, `name`, and `factory` expected')
    }

    const index = legacyFactories.indexOf(factory)
    let instance
    if (index === -1) {
      // doesn't yet exist
      if (factory.math === true) {
        // pass with math namespace
        instance = factory.factory(math.type, _config, load, math.typed, math)
      } else {
        instance = factory.factory(math.type, _config, load, math.typed)
      }

      // append to the cache
      legacyFactories.push(factory)
      legacyInstances.push(instance)
    } else {
      // already existing function, return the cached instance
      instance = legacyInstances[index]
    }

    return instance
  }

  const factories = {}

  // load the import function
  math['import'] = importFactory(math.typed, load, math, factories)

  // listen for changes in config, import all functions again when changed
  math.on('config', () => {
    Object.values(factories).forEach(factory => {
      if (factory && factory.recreateOnConfigChange) {
        // FIXME: only re-create when the current instance is the same as was initially created
        // FIXME: delete the functions/constants before importing them again?
        math['import'](factory, { override: true })
      }
    })
  })

  return math
})

'use strict'

import { isBigNumber, isComplex, isFraction, isMatrix, isUnit } from '../../utils/is'
import { isFactory } from '../../utils/factory'
import { isLegacyFactory, lazy, traverse } from '../../utils/object'
import { contains, initial, last } from '../../utils/array'
import { ArgumentsError } from '../../error/ArgumentsError'

export function importFactory (typed, load, math) {
  /**
   * Import functions from an object or a module
   *
   * Syntax:
   *
   *    math.import(object)
   *    math.import(object, options)
   *
   * Where:
   *
   * - `object: Object`
   *   An object with functions to be imported.
   * - `options: Object` An object with import options. Available options:
   *   - `override: boolean`
   *     If true, existing functions will be overwritten. False by default.
   *   - `silent: boolean`
   *     If true, the function will not throw errors on duplicates or invalid
   *     types. False by default.
   *   - `wrap: boolean`
   *     If true, the functions will be wrapped in a wrapper function
   *     which converts data types like Matrix to primitive data types like Array.
   *     The wrapper is needed when extending math.js with libraries which do not
   *     support these data type. False by default.
   *
   * Examples:
   *
   *    // define new functions and variables
   *    math.import({
   *      myvalue: 42,
   *      hello: function (name) {
   *        return 'hello, ' + name + '!'
   *      }
   *    })
   *
   *    // use the imported function and variable
   *    math.myvalue * 2               // 84
   *    math.hello('user')             // 'hello, user!'
   *
   *    // import the npm module 'numbers'
   *    // (must be installed first with `npm install numbers`)
   *    math.import(require('numbers'), {wrap: true})
   *
   *    math.fibonacci(7) // returns 13
   *
   * @param {Object | Array} object   Object with functions to be imported.
   * @param {Object} [options]        Import options.
   */
  function mathImport (object, options) {
    const num = arguments.length
    if (num !== 1 && num !== 2) {
      throw new ArgumentsError('import', num, 1, 2)
    }

    if (!options) {
      options = {}
    }

    // TODO: allow a typed-function with name too
    if (isFactory(object)) {
      _importFactory(object, options)
    } else if (isLegacyFactory(object)) {
      _importLegacyFactory(object, options)
    } else if (Array.isArray(object)) {
      object.forEach((entry) => mathImport(entry, options))
    } else if (typeof object === 'object') {
      // a map with functions
      for (const name in object) {
        if (object.hasOwnProperty(name)) {
          const value = object[name]
          if (isFactory(value)) {
            _importFactory(value, options, name)
          } else if (isSupportedType(value)) {
            _import(name, value, options)
          } else if (isLegacyFactory(object)) {
            _importLegacyFactory(object, options)
          } else {
            mathImport(value, options)
          }
        }
      }
    } else {
      if (!options.silent) {
        throw new TypeError('Factory, Object, or Array expected')
      }
    }
  }

  /**
   * Add a property to the math namespace and create a chain proxy for it.
   * @param {string} name
   * @param {*} value
   * @param {Object} options  See import for a description of the options
   * @private
   */
  function _import (name, value, options) {
    // TODO: refactor this function, it's to complicated and contains duplicate code
    if (options.wrap && typeof value === 'function') {
      // create a wrapper around the function
      value = _wrap(value)
    }

    // turn a plain function with a typed-function signature into a typed-function
    if (hasTypedFunctionSignature(value)) {
      value = typed(name, {
        [value.signature]: value
      })
    }

    if (isTypedFunction(math[name]) && isTypedFunction(value)) {
      if (options.override) {
        // give the typed function the right name
        value = typed(name, value.signatures)
      } else {
        // merge the existing and typed function
        value = typed(math[name], value)
      }

      math[name] = value
      _importTransform(name, value)
      math.emit('import', name, function resolver () {
        return value
      })
      return
    }

    if (math[name] === undefined || options.override) {
      math[name] = value
      _importTransform(name, value)
      math.emit('import', name, function resolver () {
        return value
      })
      return
    }

    if (!options.silent) {
      throw new Error('Cannot import "' + name + '": already exists')
    }
  }

  function _importTransform (name, value) {
    if (value && typeof value.transform === 'function') {
      math.expression.transform[name] = value.transform
      if (allowedInExpressions(name)) {
        math.expression.mathWithTransform[name] = value.transform
      }
    } else {
      // remove existing transform
      delete math.expression.transform[name]
      if (allowedInExpressions(name)) {
        math.expression.mathWithTransform[name] = value
      }
    }
  }

  function _deleteTransform (name) {
    delete math.expression.transform[name]
    if (allowedInExpressions(name)) {
      math.expression.mathWithTransform[name] = math[name]
    } else {
      delete math.expression.mathWithTransform[name]
    }
  }

  /**
   * Create a wrapper a round an function which converts the arguments
   * to their primitive values (like convert a Matrix to Array)
   * @param {Function} fn
   * @return {Function} Returns the wrapped function
   * @private
   */
  function _wrap (fn) {
    const wrapper = function wrapper () {
      const args = []
      for (let i = 0, len = arguments.length; i < len; i++) {
        const arg = arguments[i]
        args[i] = arg && arg.valueOf()
      }
      return fn.apply(math, args)
    }

    if (fn.transform) {
      wrapper.transform = fn.transform
    }

    return wrapper
  }

  /**
   * Import an instance of a factory into math.js
   * @param {{factory: Function, name: string, path: string, math: boolean}} factory
   * @param {Object} options  See import for a description of the options
   * @private
   */
  function _importLegacyFactory (factory, options) {
    if (typeof factory.name === 'string') {
      const name = factory.name
      const existingTransform = name in math.expression.transform
      const namespace = factory.path ? traverse(math, factory.path) : math
      const existing = namespace.hasOwnProperty(name) ? namespace[name] : undefined

      const resolver = function () {
        let instance = load(factory)
        if (instance && typeof instance.transform === 'function') {
          throw new Error('Transforms cannot be attached to factory functions. ' +
              'Please create a separate function for it with exports.path="expression.transform"')
        }

        if (isTypedFunction(existing) && isTypedFunction(instance)) {
          if (options.override) {
            // replace the existing typed function (nothing to do)
          } else {
            // merge the existing and new typed function
            instance = typed(existing, instance)
          }

          return instance
        }

        if (existing === undefined || options.override) {
          return instance
        }

        if (!options.silent) {
          throw new Error('Cannot import "' + name + '": already exists')
        }
      }

      if (factory.lazy !== false) {
        lazy(namespace, name, resolver)

        if (existingTransform) {
          _deleteTransform(name)
        } else {
          if (factory.path === 'expression.transform' || legacyFactoryAllowedInExpressions(factory)) {
            lazy(math.expression.mathWithTransform, name, resolver)
          }
        }
      } else {
        namespace[name] = resolver()

        if (existingTransform) {
          _deleteTransform(name)
        } else {
          if (factory.path === 'expression.transform' || legacyFactoryAllowedInExpressions(factory)) {
            math.expression.mathWithTransform[name] = resolver()
          }
        }
      }

      math.emit('import', name, resolver, factory.path)
    } else {
      // unnamed factory.
      // no lazy loading
      load(factory)
    }
  }

  /**
   * Import an instance of a factory into math.js
   * @param {function(scope: object)} factory
   * @param {Object} options  See import for a description of the options
   * @param {string} [fullName=factory.name] Optional custom name
   * @private
   */
  function _importFactory (factory, options, fullName = factory.fn) {
    const nameContainsPath = fullName.indexOf('.') !== -1
    const path = nameContainsPath ? initial(fullName.split('.')) : undefined
    const name = nameContainsPath ? last(fullName.split('.')) : fullName
    const namespace = path ? traverse(math, path) : math
    const existingTransform = name in math.expression.transform
    const existing = namespace.hasOwnProperty(name) ? namespace[name] : undefined

    const resolver = function () {
      let instance
      if (contains(factory.dependencies, 'math')) {
        // TODO: it's not nice having to pass the whole math namespace. find a better way
        // FIXME: not very efficient
        const mathWithNamespace = Object.create(math)
        mathWithNamespace.math = math
        mathWithNamespace.config = math.config()
        instance = /* #__PURE__ */ factory(mathWithNamespace)
      } else {
        // FIXME: not very efficient
        const mathWithConfig = Object.create(math)
        mathWithConfig.config = math.config()
        instance = /* #__PURE__ */ factory(mathWithConfig)
      }

      if (instance && typeof instance.transform === 'function') {
        throw new Error('Transforms cannot be attached to factory functions. ' +
            'Please create a separate function for it with exports.path="expression.transform"')
      }

      if (isTypedFunction(existing) && isTypedFunction(instance)) {
        if (options.override) {
          // replace the existing typed function (nothing to do)
        } else {
          // merge the existing and new typed function
          instance = typed(existing, instance)
        }

        return instance
      }

      if (existing === undefined || options.override) {
        return instance
      }

      if (!options.silent) {
        // console.log('math', JSON.stringify(Object.keys(math)))
        throw new Error('Cannot import "' + fullName + '": already exists')
      }
    }

    if (factory.lazy !== false) {
      lazy(namespace, name, resolver)

      if (existingTransform) {
        _deleteTransform(name)
      } else {
        if ((path && path.join('.') === 'expression.transform') || factoryAllowedInExpressions(factory)) {
          lazy(math.expression.mathWithTransform, name, () => namespace[name])
        }
      }
    } else {
      namespace[name] = resolver()

      if (existingTransform) {
        _deleteTransform(name)
      } else {
        if ((path && path.join('.') === 'expression.transform') || factoryAllowedInExpressions(factory)) {
          math.expression.mathWithTransform[name] = namespace[name]
        }
      }
    }

    math.emit('import', name, resolver, path)
  }

  /**
   * Check whether given object is a type which can be imported
   * @param {Function | number | string | boolean | null | Unit | Complex} object
   * @return {boolean}
   * @private
   */
  function isSupportedType (object) {
    return typeof object === 'function' ||
        typeof object === 'number' ||
        typeof object === 'string' ||
        typeof object === 'boolean' ||
        object === null ||
        isUnit(object) ||
        isComplex(object) ||
        isBigNumber(object) ||
        isFraction(object) ||
        isMatrix(object) ||
        Array.isArray(object)
  }

  /**
   * Test whether a given thing is a typed-function
   * @param {*} fn
   * @return {boolean} Returns true when `fn` is a typed-function
   */
  function isTypedFunction (fn) {
    return typeof fn === 'function' && typeof fn.signatures === 'object'
  }

  function hasTypedFunctionSignature (fn) {
    return typeof fn === 'function' && typeof fn.signature === 'string'
  }

  function allowedInExpressions (name) {
    return !unsafe.hasOwnProperty(name)
  }

  function legacyFactoryAllowedInExpressions (factory) {
    return factory.path === undefined && !unsafe.hasOwnProperty(factory.name)
  }

  function factoryAllowedInExpressions (factory) {
    return factory.fn.indexOf('.') === -1 && !unsafe.hasOwnProperty(factory.fn)
  }

  // namespaces and functions not available in the parser for safety reasons
  const unsafe = {
    'expression': true,
    'type': true,
    'docs': true,
    'error': true,
    'json': true,
    'chain': true // chain method not supported. Note that there is a unit chain too.
  }

  return mathImport
}

'use strict'

import functions from './function'
import node from './node'
import { createParseExpression } from './parse'
import transform from './transform'
import { createEmbeddedDocs } from './embeddedDocs'
import { createHelpClass } from './Help'
import { createParserClass } from './Parser'

export default [
  // Note that the docs folder is called "embeddedDocs" and not "docs" to prevent issues
  // with yarn autoclean. See https://github.com/josdejong/mathjs/issues/969
  createEmbeddedDocs,
  functions,
  node,
  transform,

  createHelpClass,
  createParseExpression,
  createParserClass
]

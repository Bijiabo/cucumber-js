import * as babel from '@babel/core'
import { v4 as uuid } from 'uuid'

export type SourceCodeRequireReplaceLogic = (params: {
  originalRequirePath: string
}) => {
  needReplace: boolean
  newContent?: string
}

export function replaceRequirePathForSourceCode(config: {
  sourceCodeString: string
  filename?: string
  replaceLogic: SourceCodeRequireReplaceLogic
}): string | undefined {
  const { sourceCodeString, filename = uuid(), replaceLogic } = config
  const transformedCode = babel.transform(sourceCodeString, {
    filename: filename,
    // presets: ['@babel/preset-env'], // Convert to ES5 code
    plugins: [
      [
        require('@babel/plugin-transform-modules-commonjs'),
        {
          allowTopLevelThis: true,
          strictMode: false,
        },
      ],
      require('@babel/plugin-syntax-dynamic-import'),
      {
        visitor: {
          CallExpression(path: any) {
            if (
              path.node.callee.type === 'Identifier' &&
              path.node.callee.name === 'require' &&
              path.node.arguments[0].type === 'StringLiteral'
            ) {
              const { needReplace, newContent: newRequirePath } = replaceLogic({
                originalRequirePath: path.node.arguments[0].value,
              })
              if (needReplace && newRequirePath) {
                path.node.arguments[0].value = newRequirePath
              }
            }
            // remove use strict
            const value = path.get('value')
            if (value.isStringLiteral({ value: 'use strict' })) {
              path.remove()
            }
          },
        },
      },
    ],
    parserOpts: {
      strictMode: false,
    },
  })

  if (transformedCode?.code) {
    return transformedCode.code
  }

  return undefined
}


/**
 * 替换 require 语句
 * @param config 
 * @returns 
 */
export function replaceRequireStatementForSourceCode(config: {
  sourceCodeString: string
  filename?: string
  replaceLogic: SourceCodeRequireReplaceLogic
}): string | undefined {
  const { sourceCodeString, filename = uuid(), replaceLogic } = config
  const transformedCode = babel.transform(sourceCodeString, {
    filename: filename,
    // presets: ['@babel/preset-env'], // Convert to ES5 code
    plugins: [
      [
        require('@babel/plugin-transform-modules-commonjs'),
        {
          allowTopLevelThis: true,
          strictMode: false,
        },
      ],
      require('@babel/plugin-syntax-dynamic-import'),
      {
        visitor: {
          CallExpression(path: any) {
            if (
              path.node.callee.type === 'Identifier' &&
              path.node.callee.name === 'require' &&
              path.node.arguments[0].type === 'StringLiteral'
            ) {
              const { needReplace, newContent: newStatement } = replaceLogic({
                originalRequirePath: path.node.arguments[0].value,
              })
              if (needReplace && newStatement) {
                path.replaceWithSourceString(newStatement);
              }
            }
            // remove use strict
            const value = path.get('value')
            if (value.isStringLiteral({ value: 'use strict' })) {
              path.remove()
            }
          },
        },
      },
    ],
    parserOpts: {
      strictMode: false,
    },
  })

  if (transformedCode?.code) {
    return transformedCode.code
  }

  return undefined
}

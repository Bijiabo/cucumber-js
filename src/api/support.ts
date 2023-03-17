import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { v4 as uuid } from 'uuid'
import { IdGenerator } from '@cucumber/messages'
import { ISupportCodeLibrary } from '../support_code_library_builder/types'
import supportCodeLibraryBuilder from '../support_code_library_builder'
import { pathToFileURL } from 'url'
import {
  replaceRequirePathForSourceCode,
  replaceRequireStatementForSourceCode,
} from './replaceRequirePath'
const vm = require('vm')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { importer } = require('../importer')

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:\\/.test(path)
}

function isRelativePath(path: string): boolean {
  return path.startsWith('./') || path.startsWith('../')
}

function isPath(path: string): boolean {
  return isAbsolutePath(path) || isRelativePath(path)
}

function isSubdirectory(params: {
  subdirectory: string
  directory: string
}): boolean {
  const { subdirectory, directory } = params
  const relativePath = path.relative(subdirectory, directory)
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

/**
 * Find the nearest node_modules directory in the parent directories of the specified file path.
 * @param filePath The file path to start searching from.
 * @returns The absolute path to the nearest node_modules directory or null if not found.
 */
export function findNearestNodeModules(filePath: string): string | null {
  let currentDir = path.dirname(path.resolve(path.join(filePath, '../../..')))

  while (true) {
    const nodeModulesPath = path.join(currentDir, 'node_modules')

    if (fs.existsSync(nodeModulesPath)) {
      return nodeModulesPath
    }

    const parentDir = path.dirname(currentDir)

    if (parentDir === currentDir) {
      return null
    }

    currentDir = parentDir
  }
}

export async function getSupportCodeLibrary({
  cwd,
  newId,
  requireModules,
  requirePaths,
  importPaths,
  projectRootPath,
  customContext,
}: {
  cwd: string
  newId: IdGenerator.NewId
  requireModules: string[]
  requirePaths: string[]
  importPaths: string[]
  projectRootPath?: string
  customContext?: Record<string, any>
}): Promise<ISupportCodeLibrary> {
  supportCodeLibraryBuilder.reset(cwd, newId, {
    requireModules,
    requirePaths,
    importPaths,
  })
  requireModules.map((module) => require(module))

  // todo: 增加一段英文注释
  // prepare path
  let pathForNodeModulesDir: string
  let pathForProjectRoot: string
  if (projectRootPath) {
    pathForNodeModulesDir = path.join(projectRootPath, 'node_modules')
    pathForProjectRoot = projectRootPath
  } else {
    pathForNodeModulesDir = findNearestNodeModules(__dirname)
    pathForProjectRoot = path.join(pathForNodeModulesDir, '..')
  }

  for (let requirePath of requirePaths) {
    const isInCurrentProjectDir = isSubdirectory({
      directory: pathForProjectRoot,
      subdirectory: requirePath,
    })

    if (isInCurrentProjectDir) {
      require(requirePath)
    } else {
      // load file source code
      let sourceCodeString = fs.readFileSync(requirePath, 'utf8')
      // generate fake filename by file path
      let fileName = uuid()
      {
        const md5 = createHash('md5')
        md5.update(requirePath)
        fileName = md5.digest('hex')
      }
      // replace require logic
      if (customContext) {
        /**
         * The context is passed in via the vm module
         * replace require statement to context variable
         */
        sourceCodeString = replaceRequireStatementForSourceCode({
          sourceCodeString,
          replaceLogic: ({ originalRequirePath }) => {
            if (isPath(originalRequirePath)) {
              return {
                needReplace: false,
              }
            } else {
              const npmPackagePathInCurrentNodeModules = path.join(
                pathForNodeModulesDir,
                originalRequirePath
              )
              /**
               * target map
               * original require path -> target statement
               */
              const replaceMap: { [key: string]: string } = {
                '@cucumber/cucumber': 'Cucumber',
                assert: 'Assert',
              }
              if (replaceMap[originalRequirePath]) {
                return {
                  needReplace: true,
                  newContent: replaceMap[originalRequirePath],
                }
              } else {
                return {
                  needReplace: false,
                }
              }
            }
          },
        })
      } else {
        /**
         * The context is not passed in via the vm module
         * replace require path
         */
        sourceCodeString = replaceRequirePathForSourceCode({
          sourceCodeString,
          replaceLogic: ({ originalRequirePath }) => {
            if (isPath(originalRequirePath)) {
              return {
                needReplace: false,
              }
            } else {
              const npmPackagePathInCurrentNodeModules = path.join(
                pathForNodeModulesDir,
                originalRequirePath
              )
              const packageInstalledInCurrentProject = fs.existsSync(
                npmPackagePathInCurrentNodeModules
              )
              if (packageInstalledInCurrentProject) {
                return {
                  needReplace: true,
                  newContent: npmPackagePathInCurrentNodeModules,
                }
              } else {
                return {
                  needReplace: false,
                }
              }
            }
          },
        })
      }

      // not support for electron release Node.js environment
      /*
      // @ts-ignore
      const mod = new module.constructor()
      mod._compile(sourceCodeString, fileName)
      //*/
      const script = new vm.Script(sourceCodeString)
      console.log('### vm custom context:', customContext)
      const context = vm.createContext({
        ...customContext,
      })
      script.runInContext(context)
    }
  }
  for (const path of importPaths) {
    await importer(pathToFileURL(path))
  }
  return supportCodeLibraryBuilder.finalize()
}

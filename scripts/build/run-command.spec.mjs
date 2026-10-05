import { describe, expect, it } from 'vitest'

import { commandName, spawnPlan } from './run-command.mjs'

describe('spawn plan', () => {
  it('runs a command directly off windows', () => {
    expect(spawnPlan('npm', ['install'], 'darwin')).toEqual({ file: 'npm', args: ['install'] })
    expect(spawnPlan('pnpm', ['run', 'check'], 'linux')).toEqual({ file: 'pnpm', args: ['run', 'check'] })
  })

  it('sends a windows .cmd through the command interpreter', () => {
    const plan = spawnPlan('npm', ['install', '--no-fund'], 'win32')
    expect(plan.file.endsWith('cmd.exe')).toBe(true)
    expect(plan.args).toEqual(['/d', '/s', '/c', 'npm.cmd', 'install', '--no-fund'])
    expect(spawnPlan('pnpm', ['-r', 'publish'], 'win32').args).toEqual(['/d', '/s', '/c', 'pnpm.cmd', '-r', 'publish'])
  })

  it('runs a windows executable directly', () => {
    expect(spawnPlan('cargo', ['build', '--release'], 'win32')).toEqual({ file: 'cargo.exe', args: ['build', '--release'] })
    expect(commandName('npm', 'win32')).toBe('npm.cmd')
    expect(commandName('cargo', 'win32')).toBe('cargo.exe')
    expect(commandName('npm', 'darwin')).toBe('npm')
  })
})

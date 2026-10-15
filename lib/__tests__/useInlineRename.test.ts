import { describe, it, expect } from 'vitest'
import { worthSaving } from '@/lib/hooks/useInlineRename'

describe('worthSaving', () => {
  it('saves a name that actually changed', () => {
    expect(worthSaving('Acme Research', 'Acme')).toBe(true)
  })

  it('does not send a request for a name that did not change', () => {
    expect(worthSaving('Acme', 'Acme')).toBe(false)
  })

  it('ignores whitespace the typist left either side', () => {
    expect(worthSaving('  Acme  ', 'Acme')).toBe(false)
    expect(worthSaving('Acme', '  Acme  ')).toBe(false)
  })

  it('refuses a blank name, which would leave a workspace with no title', () => {
    expect(worthSaving('', 'Acme')).toBe(false)
    expect(worthSaving('   ', 'Acme')).toBe(false)
  })

  it('still saves when only the case changed, which is a real rename', () => {
    expect(worthSaving('ACME', 'Acme')).toBe(true)
  })
})

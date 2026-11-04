import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers.mjs'

const { allowedEmailDomains, emailDomainAllowed, domainRestrictionMessage } = load('access-domain')

test('no allowlist configured: testing mode, every email is allowed', () => {
  for (const env of [{}, { ULEBI_ALLOWED_EMAIL_DOMAINS: '' }, { ULEBI_ALLOWED_EMAIL_DOMAINS: ' , ' }]) {
    assert.deepEqual(allowedEmailDomains(env), [])
    assert.equal(emailDomainAllowed('someone@gmail.com', env), true)
    assert.equal(emailDomainAllowed('RN-204', env), true)
  }
})

test('ulebi.com allowlist: only that domain passes, case-insensitively', () => {
  const env = { ULEBI_ALLOWED_EMAIL_DOMAINS: 'ulebi.com' }
  assert.equal(emailDomainAllowed('sara@ulebi.com', env), true)
  assert.equal(emailDomainAllowed('  Sara@ULEBI.com ', env), true)
  assert.equal(emailDomainAllowed('sara@gmail.com', env), false)
  assert.equal(emailDomainAllowed('sara@ulebi.com.evil.io', env), false)
  assert.equal(emailDomainAllowed('sara@notulebi.com', env), false)
  assert.equal(emailDomainAllowed('sara@sub.ulebi.com', env), false)
  assert.equal(emailDomainAllowed('RN-204', env), false)
  assert.equal(emailDomainAllowed('', env), false)
})

test('several domains, with or without a leading @', () => {
  const env = { ULEBI_ALLOWED_EMAIL_DOMAINS: '@ulebi.com, Ulebi.org' }
  assert.deepEqual(allowedEmailDomains(env), ['ulebi.com', 'ulebi.org'])
  assert.equal(emailDomainAllowed('a@ulebi.org', env), true)
  assert.equal(domainRestrictionMessage(env), 'Access is limited to @ulebi.com or @ulebi.org accounts.')
})

test('ULEBI_TEST_LOGIN is opt-in: only the literal value true turns it on', () => {
  const { testLoginEnabled } = load('access-domain')
  assert.equal(testLoginEnabled({}), false)
  assert.equal(testLoginEnabled({ ULEBI_TEST_LOGIN: 'false' }), false)
  assert.equal(testLoginEnabled({ ULEBI_TEST_LOGIN: '1' }), false)
  assert.equal(testLoginEnabled({ ULEBI_TEST_LOGIN: ' TRUE ' }), true)
})

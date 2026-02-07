/**
 * Unit tests for proxy setup utility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getProxyUrl, getNoProxyPatterns, shouldBypassProxy, setupGlobalProxy } from './proxySetup';

describe('proxySetup', () => {
  // Store original env vars to restore after tests
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear proxy-related env vars before each test
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
    delete process.env.NO_PROXY;
    delete process.env.no_proxy;
  });

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv };
  });

  describe('getProxyUrl', () => {
    it('should return null when no proxy env vars are set', () => {
      expect(getProxyUrl()).toBeNull();
    });

    it('should return HTTPS_PROXY when set', () => {
      process.env.HTTPS_PROXY = 'http://proxy.example.com:8080';
      expect(getProxyUrl()).toBe('http://proxy.example.com:8080');
    });

    it('should return https_proxy (lowercase) when set', () => {
      process.env.https_proxy = 'http://proxy.example.com:8080';
      expect(getProxyUrl()).toBe('http://proxy.example.com:8080');
    });

    it('should return HTTP_PROXY when HTTPS_PROXY is not set', () => {
      process.env.HTTP_PROXY = 'http://proxy.example.com:3128';
      expect(getProxyUrl()).toBe('http://proxy.example.com:3128');
    });

    it('should prefer HTTPS_PROXY over HTTP_PROXY', () => {
      process.env.HTTPS_PROXY = 'http://https-proxy.example.com:8080';
      process.env.HTTP_PROXY = 'http://http-proxy.example.com:3128';
      expect(getProxyUrl()).toBe('http://https-proxy.example.com:8080');
    });

    it('should prefer uppercase over lowercase', () => {
      process.env.HTTPS_PROXY = 'http://upper.example.com:8080';
      process.env.https_proxy = 'http://lower.example.com:8080';
      expect(getProxyUrl()).toBe('http://upper.example.com:8080');
    });
  });

  describe('getNoProxyPatterns', () => {
    it('should return empty array when NO_PROXY is not set', () => {
      expect(getNoProxyPatterns()).toEqual([]);
    });

    it('should parse comma-separated NO_PROXY patterns', () => {
      process.env.NO_PROXY = 'localhost,127.0.0.1,.example.com';
      expect(getNoProxyPatterns()).toEqual(['localhost', '127.0.0.1', '.example.com']);
    });

    it('should handle NO_PROXY with spaces', () => {
      process.env.NO_PROXY = 'localhost, 127.0.0.1 , .example.com ';
      expect(getNoProxyPatterns()).toEqual(['localhost', '127.0.0.1', '.example.com']);
    });

    it('should handle single pattern', () => {
      process.env.NO_PROXY = 'localhost';
      expect(getNoProxyPatterns()).toEqual(['localhost']);
    });

    it('should handle no_proxy (lowercase)', () => {
      process.env.no_proxy = 'localhost,127.0.0.1';
      expect(getNoProxyPatterns()).toEqual(['localhost', '127.0.0.1']);
    });

    it('should filter out empty patterns', () => {
      process.env.NO_PROXY = 'localhost,,127.0.0.1,  ,example.com';
      expect(getNoProxyPatterns()).toEqual(['localhost', '127.0.0.1', 'example.com']);
    });
  });

  describe('shouldBypassProxy', () => {
    it('should return false when no NO_PROXY patterns', () => {
      expect(shouldBypassProxy('https://example.com', [])).toBe(false);
    });

    it('should match exact hostname', () => {
      const patterns = ['localhost', '127.0.0.1'];
      expect(shouldBypassProxy('http://localhost:3000', patterns)).toBe(true);
      expect(shouldBypassProxy('http://127.0.0.1:8080', patterns)).toBe(true);
    });

    it('should match domain suffix with leading dot', () => {
      const patterns = ['.example.com'];
      expect(shouldBypassProxy('https://api.example.com', patterns)).toBe(true);
      expect(shouldBypassProxy('https://www.example.com', patterns)).toBe(true);
      expect(shouldBypassProxy('https://example.com', patterns)).toBe(false);
      expect(shouldBypassProxy('https://notexample.com', patterns)).toBe(false);
    });

    it('should match domain suffix without leading dot', () => {
      const patterns = ['example.com'];
      expect(shouldBypassProxy('https://api.example.com', patterns)).toBe(true);
      expect(shouldBypassProxy('https://www.example.com', patterns)).toBe(true);
      expect(shouldBypassProxy('https://example.com', patterns)).toBe(true);
    });

    it('should be case-insensitive', () => {
      const patterns = ['LocalHost', 'Example.COM'];
      expect(shouldBypassProxy('http://LOCALHOST:3000', patterns)).toBe(true);
      expect(shouldBypassProxy('https://api.EXAMPLE.com', patterns)).toBe(true);
    });

    it('should handle wildcard pattern', () => {
      const patterns = ['*'];
      expect(shouldBypassProxy('https://any-url.com', patterns)).toBe(true);
      expect(shouldBypassProxy('http://localhost', patterns)).toBe(true);
    });

    it('should return false for non-matching URLs', () => {
      const patterns = ['localhost', '.internal.com'];
      expect(shouldBypassProxy('https://external.com', patterns)).toBe(false);
      expect(shouldBypassProxy('https://example.com', patterns)).toBe(false);
    });

    it('should handle invalid URLs gracefully', () => {
      const patterns = ['localhost'];
      expect(shouldBypassProxy('not-a-valid-url', patterns)).toBe(false);
    });

    it('should match real-world scenario: OAuth with proxy bypass', () => {
      const patterns = ['localhost', '127.0.0.1', '.local'];
      
      // Should bypass proxy for local callback server
      expect(shouldBypassProxy('http://localhost:54545/oauth2callback', patterns)).toBe(true);
      expect(shouldBypassProxy('http://127.0.0.1:54545/oauth2callback', patterns)).toBe(true);
      
      // Should NOT bypass proxy for external OAuth endpoints
      expect(shouldBypassProxy('https://oauth2.googleapis.com/token', patterns)).toBe(false);
      expect(shouldBypassProxy('https://accounts.google.com/o/oauth2/v2/auth', patterns)).toBe(false);
    });
  });

  describe('setupGlobalProxy', () => {
    it('should return false when no proxy env vars are set', () => {
      expect(setupGlobalProxy()).toBe(false);
    });

    it('should return true when proxy env var is set', () => {
      process.env.HTTPS_PROXY = 'http://proxy.example.com:8080';
      expect(setupGlobalProxy()).toBe(true);
    });

    it('should handle invalid proxy URL gracefully', () => {
      process.env.HTTPS_PROXY = 'not-a-valid-url';
      // Should not throw, just return false or true depending on Undici behavior
      const result = setupGlobalProxy();
      expect(typeof result).toBe('boolean');
    });
  });
});

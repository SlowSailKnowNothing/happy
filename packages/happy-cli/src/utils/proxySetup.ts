/**
 * Proxy setup utility for Node/Undici fetch
 * 
 * Configures global Undici dispatcher to honor standard proxy environment variables
 * (HTTPS_PROXY, HTTP_PROXY, NO_PROXY) for all fetch calls in the CLI.
 * 
 * This is necessary because Node's built-in fetch (Undici) does not automatically
 * use proxy environment variables like curl does.
 */

import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { logger } from '@/ui/logger';

/**
 * Parse proxy URL from environment variables
 * Supports both HTTPS_PROXY and HTTP_PROXY
 */
export function getProxyUrl(): string | null {
  // Check common proxy environment variables (both upper and lowercase)
  const proxyUrl = 
    process.env.HTTPS_PROXY || 
    process.env.https_proxy || 
    process.env.HTTP_PROXY || 
    process.env.http_proxy;
  
  return proxyUrl || null;
}

/**
 * Parse NO_PROXY environment variable into a list of patterns
 * NO_PROXY can be a comma-separated list of domains/IPs to bypass proxy
 * Examples: "localhost,127.0.0.1,.example.com"
 */
export function getNoProxyPatterns(): string[] {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy;
  
  if (!noProxy) {
    return [];
  }
  
  return noProxy
    .split(',')
    .map(pattern => pattern.trim())
    .filter(pattern => pattern.length > 0);
}

/**
 * Check if a URL should bypass the proxy based on NO_PROXY patterns
 * 
 * @param urlString - The URL to check
 * @param noProxyPatterns - Array of NO_PROXY patterns
 * @returns true if proxy should be bypassed, false otherwise
 */
export function shouldBypassProxy(urlString: string, noProxyPatterns: string[]): boolean {
  if (noProxyPatterns.length === 0) {
    return false;
  }
  
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    
    for (const pattern of noProxyPatterns) {
      const lowerPattern = pattern.toLowerCase();
      
      // Exact match
      if (hostname === lowerPattern) {
        return true;
      }
      
      // Domain suffix match (e.g., ".example.com" matches "api.example.com")
      if (lowerPattern.startsWith('.') && hostname.endsWith(lowerPattern)) {
        return true;
      }
      
      // Domain suffix match without leading dot
      if (!lowerPattern.startsWith('.') && hostname.endsWith('.' + lowerPattern)) {
        return true;
      }
      
      // Wildcard match (simplified - just check if pattern is "*")
      if (lowerPattern === '*') {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    // If URL parsing fails, don't bypass proxy
    logger.debug(`Failed to parse URL for proxy bypass check: ${urlString}`, error);
    return false;
  }
}

/**
 * Setup global proxy dispatcher for all Undici/fetch calls
 * 
 * This should be called early in the CLI startup to ensure all fetch calls
 * respect proxy environment variables.
 * 
 * Uses EnvHttpProxyAgent which automatically reads and respects:
 * - HTTPS_PROXY / https_proxy
 * - HTTP_PROXY / http_proxy  
 * - NO_PROXY / no_proxy
 * 
 * @returns true if proxy was configured, false otherwise
 */
export function setupGlobalProxy(): boolean {
  const proxyUrl = getProxyUrl();
  
  if (!proxyUrl) {
    logger.debug('No proxy environment variables detected (HTTPS_PROXY/HTTP_PROXY)');
    return false;
  }
  
  const noProxyPatterns = getNoProxyPatterns();
  
  try {
    // Use EnvHttpProxyAgent which automatically handles proxy env vars
    // This is better than manually creating ProxyAgent because it automatically
    // handles NO_PROXY patterns and selects the right proxy for HTTP vs HTTPS
    const proxyAgent = new EnvHttpProxyAgent();
    
    // Set as global dispatcher for all undici/fetch calls
    setGlobalDispatcher(proxyAgent);
    
    logger.debug(`✓ Proxy configured: ${proxyUrl}`);
    if (noProxyPatterns.length > 0) {
      logger.debug(`  NO_PROXY patterns: ${noProxyPatterns.join(', ')}`);
    }
    
    return true;
  } catch (error) {
    logger.warn(`Failed to setup proxy: ${error}`);
    return false;
  }
}

/**
 * Log proxy bypass information for a specific URL
 * Useful for debugging proxy behavior
 * 
 * @param urlString - The URL being fetched
 */
export function logProxyUsage(urlString: string): void {
  const proxyUrl = getProxyUrl();
  
  if (!proxyUrl) {
    return;
  }
  
  const noProxyPatterns = getNoProxyPatterns();
  const bypassed = shouldBypassProxy(urlString, noProxyPatterns);
  
  if (bypassed) {
    logger.debug(`  ↪ Bypassing proxy for: ${urlString} (matches NO_PROXY)`);
  } else {
    logger.debug(`  → Using proxy for: ${urlString}`);
  }
}

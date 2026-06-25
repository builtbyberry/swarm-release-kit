import http from 'node:http';
import https from 'node:https';

/**
 * An HTTP error carrying the parsed body, so callers can read the store's
 * fail-loud `error` (e.g. `claim_conflict`, `not_startable`) and its fields.
 */
export class HttpError extends Error {
    /**
     * @param {number} status
     * @param {any} body
     */
    constructor(status, body) {
        super(`HTTP ${status}`);
        this.name = 'HttpError';
        this.status = status;
        this.body = body;
    }
}

/**
 * @param {string} data
 * @returns {any}
 */
function safeJson(data) {
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * Make a JSON request to the SRM store with no third-party dependencies.
 *
 * @param {'GET'|'POST'} method
 * @param {string} urlString
 * @param {{ token?: string, body?: object }} [options]
 * @returns {Promise<{ status: number, json: any }>}
 */
export function request(method, urlString, { token, body } = {}) {
    return new Promise((resolve, reject) => {
        let url;
        try {
            url = new URL(urlString);
        } catch {
            reject(new Error(`Invalid URL: ${urlString}`));

            return;
        }

        const lib = url.protocol === 'http:' ? http : https;
        const payload = body ? JSON.stringify(body) : null;

        const req = lib.request(
            url,
            {
                method,
                headers: {
                    Accept: 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(payload
                        ? {
                              'Content-Type': 'application/json',
                              'Content-Length': Buffer.byteLength(payload),
                          }
                        : {}),
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    const json = data ? safeJson(data) : null;
                    const status = res.statusCode ?? 0;

                    if (status >= 200 && status < 300) {
                        resolve({ status, json });
                    } else {
                        reject(new HttpError(status, json ?? data));
                    }
                });
            },
        );

        req.on('error', reject);

        if (payload) {
            req.write(payload);
        }

        req.end();
    });
}

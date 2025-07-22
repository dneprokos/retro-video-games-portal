// Polyfills for MSW in Node.js environment
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Additional polyfills for MSW
global.URL = require('url').URL;
global.URLSearchParams = require('url').URLSearchParams;

// TransformStream polyfill
global.TransformStream = class TransformStream {
  constructor() {
    this.readable = new ReadableStream();
    this.writable = new WritableStream();
  }
};

// ReadableStream polyfill
global.ReadableStream = class ReadableStream {
  constructor() {}
};

// WritableStream polyfill
global.WritableStream = class WritableStream {
  constructor() {}
}; 
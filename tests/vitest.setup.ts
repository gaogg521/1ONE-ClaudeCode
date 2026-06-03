/**
 * Vitest Test Setup
 * Global configuration for extension system tests
 */

// Register NodePlatformServices so modules that call getPlatformServices() work in tests.
import { registerPlatformServices } from '../src/common/platform';
import { NodePlatformServices } from '../src/common/platform/NodePlatformServices';
registerPlatformServices(new NodePlatformServices());

// Many modules register process.on('exit') handlers; full-suite runs exceed the default limit of 10.
if (process.getMaxListeners() <= 10) {
  process.setMaxListeners(20);
}

// Make this a module

// Extend global types for testing
declare global {
  // eslint-disable-next-line no-var
  var electronAPI: any;
}

const noop = () => Promise.resolve();

// Mock Electron APIs for testing
const windowControlsMock = {
  minimize: noop,
  maximize: noop,
  unmaximize: noop,
  close: noop,
  isMaximized: () => Promise.resolve(false),
  onMaximizedChange: (): (() => void) => () => void 0,
};

(global as any).electronAPI = {
  emit: noop,
  on: () => {},
  windowControls: windowControlsMock,
};

if (typeof window !== 'undefined') {
  (window as any).electronAPI = (global as any).electronAPI;
}

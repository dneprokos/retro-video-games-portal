// MSW setup temporarily disabled
// import './mocks/setup';

// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock IntersectionObserver for components that use it
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock ResizeObserver for components that use it
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    loading: jest.fn(),
    dismiss: jest.fn(),
  },
  Toaster: () => null,
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Search: () => 'SearchIcon',
  Filter: () => 'FilterIcon',
  Plus: () => 'PlusIcon',
  Edit: () => 'EditIcon',
  Trash2: () => 'TrashIcon',
  Eye: () => 'EyeIcon',
  LogOut: () => 'LogOutIcon',
  User: () => 'UserIcon',
  Users: () => 'UsersIcon',
  Gamepad2: () => 'GamepadIcon',
  Settings: () => 'SettingsIcon',
  Home: () => 'HomeIcon',
  ChevronDown: () => 'ChevronDownIcon',
  ChevronUp: () => 'ChevronUpIcon',
  Calendar: () => 'CalendarIcon',
  Star: () => 'StarIcon',
  Users2: () => 'Users2Icon',
  Crown: () => 'CrownIcon',
  Shield: () => 'ShieldIcon',
  Loader2: () => 'LoaderIcon',
  X: () => 'XIcon',
}));

// MSW setup temporarily disabled due to polyfill issues
// TODO: Re-enable MSW once polyfill issues are resolved
// import { server } from './mocks/server';
// beforeAll(() => server.listen());
// afterEach(() => server.resetHandlers());
// afterAll(() => server.close()); 
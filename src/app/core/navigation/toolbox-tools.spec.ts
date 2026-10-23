import { NAV_ITEMS } from './nav-items';
import { TOOLBOX_TOOLS } from './toolbox-tools';

describe('TOOLBOX_TOOLS', () => {
  it('lists the four tools in landing order', () => {
    expect(TOOLBOX_TOOLS.map((tool) => tool.path)).toEqual([
      'toolbox/emergency-fund',
      'toolbox/home-loan',
      'toolbox/two-pot-withdrawal',
      'toolbox/tfsa-vs-taxable',
    ]);
  });

  it('gives every tool a label, heading, description and icon', () => {
    for (const tool of TOOLBOX_TOOLS) {
      expect(tool.label, tool.path).not.toBe('');
      expect(tool.heading, tool.path).not.toBe('');
      expect(tool.description, tool.path).not.toBe('');
      expect(tool.icon, tool.path).toBeTruthy();
    }
  });

  it('keeps every tool under toolbox/ and out of the rail items', () => {
    const railPaths = new Set(NAV_ITEMS.map((item) => item.path));
    for (const tool of TOOLBOX_TOOLS) {
      expect(tool.path.startsWith('toolbox/')).toBe(true);
      expect(railPaths.has(tool.path)).toBe(false);
    }
  });

  it('has unique paths and headings', () => {
    expect(new Set(TOOLBOX_TOOLS.map((tool) => tool.path)).size).toBe(TOOLBOX_TOOLS.length);
    expect(new Set(TOOLBOX_TOOLS.map((tool) => tool.heading)).size).toBe(TOOLBOX_TOOLS.length);
  });
});

/**
 * lib/registry.js — command registry + lookup.
 * Each plugin file exports (reg) => reg.addAll([ {...cmd}, ... ])
 *
 * cmd = {
 *   name: 'sticker', aliases: ['s'], category: 'Media',
 *   desc: '...', usage: 'reply to image: .sticker',
 *   ownerOnly: false, adminOnly: false, groupOnly: false, privateOnly: false,
 *   handler: async (ctx) => {}
 * }
 */
class Registry {
  constructor() {
    this.commands = [];
  }

  addAll(list) {
    for (const c of list) {
      c.aliases = c.aliases || [];
      c.category = c.category || 'General';
      c.ownerOnly = !!c.ownerOnly;
      c.adminOnly = !!c.adminOnly;
      c.groupOnly = !!c.groupOnly;
      c.privateOnly = !!c.privateOnly;
      this.commands.push(c);
    }
    return this;
  }

  get(nameLower) {
    return (
      this.commands.find((c) => c.name.toLowerCase() === nameLower) ||
      this.commands.find((c) => c.aliases.some((a) => a.toLowerCase() === nameLower))
    );
  }

  byCategory() {
    const map = new Map();
    for (const c of this.commands) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category).push(c);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }

  get size() {
    return this.commands.length;
  }
}

module.exports = Registry;

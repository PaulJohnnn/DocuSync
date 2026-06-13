import { Mark, mergeAttributes } from '@tiptap/core';

export const AuthorMark = Mark.create({
  name: 'authorMark',

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      author: { default: null, parseHTML: el => el.getAttribute('data-author') },
      color:  { default: '#f97316', parseHTML: el => el.getAttribute('data-color') },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-author]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, {
      'data-author': HTMLAttributes.author,
      'data-color':  HTMLAttributes.color,
      style: `border-bottom: 2px solid ${HTMLAttributes.color}22;`,
    }), 0];
  },
});

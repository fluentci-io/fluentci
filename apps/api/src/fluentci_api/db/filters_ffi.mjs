// Pure bounded AST conversion. No SQL construction or database access.
import { parse } from '@rsql/parser';
import { getSelector, getValue, isComparisonNode, isLogicNode } from '@rsql/ast';
import { All, Any, Match } from './filters.mjs';
import { toList } from '../../gleam.mjs';
import { InvalidRequestError } from '@atproto/xrpc-server';
export function parseFilter(value) {
  try {
    if (value.length > 2048) throw Error();
    let nodes = 0;
    const convert = (node, depth = 0) => {
      if (++nodes > 100 || depth > 16) throw Error();
      if (isLogicNode(node)) {
        const Constructor = [';', 'and'].includes(node.operator) ? All : Any;
        return new Constructor(convert(node.left, depth + 1), convert(node.right, depth + 1));
      }
      if (!isComparisonNode(node)) throw Error();
      const field = getSelector(node);
      if (!['os', 'arch', 'topics', 'name', 'version', 'license', 'author'].includes(field))
        throw Error();
      if (!['==', '!=', '=in=', '=out='].includes(node.operator)) throw Error();
      const argument = getValue(node);
      const values = Array.isArray(argument) ? argument : [argument];
      if (
        !values.length ||
        values.length > 32 ||
        values.some((value) => !value || value.length > 128 || value.includes('*'))
      )
        throw Error();
      if (['==', '!='].includes(node.operator) && values.length !== 1) throw Error();
      return new Match(field, ['!=', '=out='].includes(node.operator), toList(values));
    };
    return convert(parse(value));
  } catch {
    throw new InvalidRequestError(
      'Invalid RSQL filter. Use os==linux;arch=in=(aarch64,x86_64). Supported fields: os, arch, topics, name, version, license, author.',
      'InvalidFilter',
    );
  }
}

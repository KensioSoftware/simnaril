import type { RequestDecoder } from "./request-decoder.js";

/**
 * Reads an `application/x-www-form-urlencoded` body with bracketed nesting.
 *
 * A wire format, and not one service's dialect. Stripe, Rails and PHP
 * applications all speak it, and all three write nesting the same way.
 *
 * ```text
 * line_items[0][price_data][unit_amount]=250
 * ```
 *
 * becomes
 *
 * ```json
 * { "line_items": [{ "price_data": { "unit_amount": "250" } }] }
 * ```
 *
 * Every leaf is a string. A form body carries no types, and guessing at them
 * would make `quantity=1` and `postcode=01234` disagree about what a digit is.
 * The resource's own creation behaviour converts what it needs.
 *
 * The header is ignored. What a body says it is and what it holds are two
 * facts, and a decoder chosen by hand has already settled the first.
 *
 * ## What it refuses
 *
 * A real encoder emits well-formed keys. The cases below are hostile or
 * mistaken input, and each throws a `SyntaxError`, the way a malformed JSON
 * body already does.
 *
 * - A key given twice (`name=a&name=b`). Which one wins is a guess, and losing
 *   half a request quietly is worse than stopping.
 * - A key needing one part to hold both a value and more keys (`a=1&a[b]=2`).
 * - An empty bracket anywhere but the end (`a[][b]=1`).
 * - A key brackets cannot be read out of (`a[b`, `[a]`).
 */
export const decodeForm: RequestDecoder = async (request) => {
  const body = await request.text();
  const root = new Map<string, unknown>();

  for (const [key, value] of new URLSearchParams(body)) {
    insert(root, key, value);
  }

  return materialise(root);
};

/** A branch of the tree, as opposed to a leaf holding one value. */
const isBranch = (held: unknown): held is Map<string, unknown> =>
  held instanceof Map;

/** A key is a name followed by any number of bracketed parts. */
const keyPattern = /^(?<name>[^[\]]+)(?<parts>(?:\[[^[\]]*\])*)$/u;
const partPattern = /\[(?<part>[^[\]]*)\]/gu;
const indexPattern = /^\d+$/u;

/** The parts of one form key, outermost first. */
function partsOf(key: string): string[] {
  const match = keyPattern.exec(key);
  const name = match?.groups?.["name"];

  if (name === undefined) {
    throw new SyntaxError(
      `Form key "${key}" is not a name followed by bracketed parts.`,
    );
  }

  const parts = [name];

  for (const part of (match?.groups?.["parts"] ?? "").matchAll(partPattern)) {
    parts.push(part.groups?.["part"] ?? "");
  }

  return parts;
}

/** Puts one key's value into the tree, growing branches on the way down. */
function insert(root: Map<string, unknown>, key: string, value: string): void {
  const parts = partsOf(key);
  let node = root;

  for (const [depth, part] of parts.entries()) {
    const last = depth === parts.length - 1;

    if (part === "" && !last) {
      throw new SyntaxError(
        `Form key "${key}" has an empty bracket before its last part.`,
      );
    }

    // An empty bracket appends, and the position it takes is the branch's size.
    const name = part === "" ? String(node.size) : part;

    if (last) {
      if (node.has(name)) {
        throw new SyntaxError(`Form key "${key}" is given twice.`);
      }

      node.set(name, value);
      return;
    }

    node = branchAt(node, name, key);
  }
}

/** The branch below `name`, created when it is the first key to need one. */
function branchAt(
  node: Map<string, unknown>,
  name: string,
  key: string,
): Map<string, unknown> {
  const held = node.get(name);

  if (isBranch(held)) {
    return held;
  }

  if (held !== undefined) {
    throw new SyntaxError(
      `Form key "${key}" needs "${name}" to hold a value and more keys at once.`,
    );
  }

  const branch = new Map<string, unknown>();
  node.set(name, branch);

  return branch;
}

/**
 * Turns the tree into arrays and objects.
 *
 * A branch whose every part is a run of digits becomes an array. The digits
 * order the entries and do not position them, so `a[0]`, `a[5]` and `a[9]`
 * give three elements and never a sparse array of ten. A real encoder counts
 * from zero, where the two readings agree.
 */
function materialise(node: Map<string, unknown>): unknown {
  const entries = [...node].map(
    ([name, held]) =>
      [name, isBranch(held) ? materialise(held) : held] as const,
  );

  if (
    entries.length > 0 &&
    entries.every(([name]) => indexPattern.test(name))
  ) {
    return entries
      .toSorted(([one], [other]) => Number(one) - Number(other))
      .map(([, held]) => held);
  }

  /*
   * `Object.fromEntries` defines own data properties, so a `__proto__` part of
   * a hostile key lands beside the others and reaches no prototype.
   */
  return Object.fromEntries(entries);
}

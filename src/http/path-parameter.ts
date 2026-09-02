/** Returns one matched path parameter or throws when it is absent. */
export function requirePathParameter(
  params: Readonly<Record<string, string>>,
  name: string,
): string {
  const value = params[name];

  if (value === undefined) {
    throw new TypeError(`Matched operation has no ":${name}" path parameter.`);
  }

  return value;
}

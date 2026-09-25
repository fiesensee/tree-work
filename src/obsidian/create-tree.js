// vault.create refuses to overwrite a file, including a collision after this check.
export async function createTreeFile(vault, folderPath, title) {
  let name = title.trim();
  if (name.toLowerCase().endsWith('.tree')) name = name.slice(0, -5).trim();
  if (!name || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error('Use a file name without slashes, reserved names, or special characters.');
  }
  if (name.length > 150) throw new Error('Keep the file name under 150 characters.');
  const prefix = folderPath && folderPath !== '/' ? `${folderPath}/` : '';
  let path = `${prefix}${name}.tree`;
  for (let suffix = 2; vault.getAbstractFileByPath(path); suffix++) {
    path = `${prefix}${name} ${suffix}.tree`;
  }
  return vault.create(path, '');
}

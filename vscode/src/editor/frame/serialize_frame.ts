import FSManager from '../../filesystem/FSManager';

export default function serializeFrame(frame: CodioFile[], rootPath: string): CodioSerializedFile[] {
  return frame
    .map((file) => {
      return serializeFile(file, rootPath);
    })
    .filter((event) => !!event);
}

function serializeFile(file: CodioFile, rootPath): CodioSerializedFile {
  return {
    column: file.column,
    lastActionCount: file.lastAction,
    path: FSManager.toRelativePath(file.uri, rootPath),
    text: file.document.text,
  };
}

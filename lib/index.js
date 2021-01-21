const fs = require("fs");
const path = require("path");
const { escape } = require("querystring");
const { promisify } = require("util");

const matter = require("gray-matter");
const removeMd = require("remove-markdown");
const striptags = require("striptags");
const nodejieba = require("nodejieba");
const mkdirp = require("mkdirp");

const readdir = promisify(fs.readdir);
const writeFile = promisify(fs.writeFile);

const { resolve } = require('path');
const stat = promisify(fs.stat);

const defaultOpt = {
  dir: "content/post",
  output: "static/js/index.json",
  matterType: "yaml",
  matterDelims: "---",
  skipDraft: true,
  extensions: ".md",
  jiebaConf: {}
};

async function getFiles(dir) {
  const subdirs = await readdir(dir);
  const files = await Promise.all(subdirs.map(async (subdir) => {
    const res = resolve(dir, subdir);
    return (await stat(res)).isDirectory() ? getFiles(res) : res;
  }));
  return files.reduce((a, f) => a.concat(f), []);
}

function urlize(str) {
  str = str
    .replace(/\s/g, "-")
    .replace(/[\(\)&@]/g, "")
    .toLowerCase();
  return escape(str);
}

function ChineseCut(str) {
  return (
    str &&
    str
      .replace(/\n/gm, "")
      .replace(
        /[\u4E00-\u9FA5\uF900-\uFA2D]+/g,
        match => ` ${nodejieba.cut(match).join(" ")} `
      )
  );
}

function handle(filename, option) {
  const pathinfo = path.parse(filename);

  const meta = matter.read(filename, {
    language: option.matterType,
    delims: option.matterDelims
  });

  if (option.skipDraft && meta.data.draft === true) return;

  const plainText =
    pathinfo.ext === ".md" ? removeMd(meta.content) : striptags(meta.content);
  let uri = filename.split('/content')[1].split('.')[0].toLowerCase();
  console.log(uri)

  if (meta.data.slug != null) uri = path.dirname(uri) + meta.data.slug;
  if (meta.data.url != null) uri = meta.data.url;
  const tags = meta.data.tags || [];
  //中文分词
  const content = ChineseCut(plainText);
  const title = ChineseCut(meta.data.title);
  const categories = meta.data.categories;
  const date = meta.data.date

  return { uri, tags, content, title, oriTitle: meta.data.title, categories, date };
}

module.exports = function(option = {}) {
  option = Object.assign({}, defaultOpt, option);
  const exts = arrayfy(option.extensions);
  nodejieba.load(option.jiebaConf);

  return getFiles(option.dir)
    .then(files => files.filter(file => exts.some(ext => file.endsWith(ext))))
    .then(files => files.map(file => handle(file, option)))
    .then(files => files.filter(file => file != null))
    .then(files => JSON.stringify(files))
    .then(index => {
      write(index, option.output)
    });
};

function write(index, output) {
  return mkdirp(path.dirname(output)).then(() =>
    writeFile(output, index, { encoding: "utf8" })
  );
}

function arrayfy(o) {
  return Array.isArray(o) ? o : o.split(",");
}
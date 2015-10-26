'use strict';

var fs = require('fs'),
  utf8 = require('to-utf-8'),
  path = require('path'),
  config = require('fgh.config'),
  now = require('moment'),
  logger = require('./utils/logger'),
  byline = require('byline');

var MAX_CONCURRENT_FILES = config.get('app:maxConcurrentFiles'),
  APP_CAMPOS = config.get('app:campos'),
  FILES_CURRENTLY_PROCESSED = [];

var arrayFiles = fs.readdirSync('./files');

processFiles(arrayFiles);

function processFiles(arrayFiles) {
  var filePath,
    currentFileName,
    currentFileSeq;

  if (MAX_CONCURRENT_FILES === null) {
    throw new Error('No se especifico configuracion "maxConcurrentFiles"');
  }

  if (isNaN(MAX_CONCURRENT_FILES) || MAX_CONCURRENT_FILES <= 0) {
    throw new Error('el valor de "maxConcurrentFiles" debe ser un numero y debe ser mayor a 0');
  }

  if (arrayFiles.length === 0) {
    logger.info('[*]No se encontraron archivos que procesar');

    return;
  }

  for (var i = 0; i < arrayFiles.length; i++) {
    currentFileName = arrayFiles[i];
    currentFileSeq = i + 1;

    if (FILES_CURRENTLY_PROCESSED.indexOf(currentFileName) !== -1) {
      logger.debug(
        '[*]El archivo ' + currentFileName +
        ' aún se esta procesando.. archivo ignorado, pasando al siguiente archivo'
      );
    } else {
      FILES_CURRENTLY_PROCESSED.push(currentFileName);

      filePath = path.join('./files', currentFileName);
      logger.info('[*]Procesando archivo:', currentFileName);

      (function(processedFilePath, processedFileName) {
        readerDoc(processedFilePath, function() {
          // cuando se termine de procesar un archivo eliminarlo del arreglo
          // de archivos en procesamiento
          var index = FILES_CURRENTLY_PROCESSED.indexOf(processedFileName);

          if (index !== -1) {
            FILES_CURRENTLY_PROCESSED.splice(index, 1);
          }
        });
      })(filePath, currentFileName);

      if (MAX_CONCURRENT_FILES === FILES_CURRENTLY_PROCESSED.length &&
        arrayFiles.length > MAX_CONCURRENT_FILES) {
        logger.info(
          '[*]Se alcanzo el maximo de archivos concurrentes en procesamiento (' +
          MAX_CONCURRENT_FILES +
          '), el resto de archivos seran procesados en el siguiente intervalo..'
        );

        break;
      }
    }
  }
}

function readerDoc(pathFile, cb) {

  var stream = fs.createReadStream(pathFile).pipe(utf8()),
    filename = path.basename(pathFile).split('-'),
    campos = Object.keys(APP_CAMPOS);

  stream = byline.createStream(stream);

  stream.on('error', cb);

  filename = filename[0] + '-' + '1' + '-' + now().format('DDMMYYYY') + '-' + filename[3] + '-' + filename[4] + '-' + filename[5];

  stream.on('data', function(line) {

    var l = '';

    line = line.toString().split(';');

    var doc = {};

    doc.nameTable = line[0];
    doc.field = line[1];
    doc.posDetail = line[2];
    doc.value = line[3];

    campos.forEach(function(c) {

      if (doc.field === c) {
        doc.value = APP_CAMPOS[doc.field];
      }

    });

    if (doc.field === 'fechaEmision') {
      doc.value = now().format('YYYY-MM-DD');
    }

    l = l.concat(doc.nameTable, ';', doc.field, ';', doc.posDetail, ';', doc.value);

    fs.appendFileSync(path.join('./files', filename), l + '\n');

  });

  stream.on('end', function() {

    fs.unlinkSync(pathFile);
    logger.info('[*]Se reemplazaron correctamente los campos');

  });

}

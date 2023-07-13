all: watch

install:
	npm install

watch:
	npm run watch

package:
	vsce package

publish:
	vsce package

.PHONY: install watch package publish

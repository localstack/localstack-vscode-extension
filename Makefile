all: watch

install:
	npm install

watch:
	npm run watch

package:
	vsce package

publish:
	vsce publish

.PHONY: install watch package publish

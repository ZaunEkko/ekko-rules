# Modern Subconverter backend with Mihomo-native protocol parsing.
# The multi-architecture image is pinned by digest for reproducible builds.
FROM aethersailor/subconverter-extended@sha256:d539a3f2e50060394ece15055728080ec0376383276f554660a130662bb4a068

RUN addgroup -S -g 10001 subconverter \
  && adduser -S -D -H -u 10001 -G subconverter subconverter \
  && mkdir -p /base/templates /base/cache \
  && chown -R subconverter:subconverter /base

COPY --chown=subconverter:subconverter pref.yml /base/pref.yml
COPY --chown=subconverter:subconverter config/ /base/config/
COPY --chown=subconverter:subconverter base/ /base/base/
COPY --chown=subconverter:subconverter snippets/ /base/snippets/
COPY --chown=subconverter:subconverter rulesets/ /base/rulesets/

ENV PREF_PATH=/base/pref.yml
USER subconverter
EXPOSE 25500
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null "http://127.0.0.1:25500/version" || exit 1

CMD ["/usr/local/bin/start-subconverter"]

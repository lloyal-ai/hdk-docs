# FSL-1.1-Apache-2.0 — canonical template

This is the canonical FSL-1.1-Apache-2.0 LICENSE text used across the lloyal
runtime stack (`liblloyal`, `lloyal-node`, `lloyal-sdk` and its FSL packages).
Each repo's `LICENSE` file is this template with the four parameters below
substituted in.

## Parameters

| Marker | Value at instantiation |
|---|---|
| `<Year>` | Year of release (e.g. `2026`) |
| `<Licensor>` | The party offering the Software (`Lloyal Labs`) |
| `<Software>` | The name of the software (`liblloyal`, `lloyal-node`, or the lloyal-sdk package name) |
| `<Change Date>` | Two years from the version's release date (e.g. release `2026-06-01` → Change Date `2028-06-01`). **Per-release**: every new published version sets its own Change Date at release time. Do not use a single global Change Date across versions. |

## Template

> Copy everything below the divider into the repo's `LICENSE` file and
> substitute the four parameters above. Do not modify the operative text.

---

# Functional Source License, Version 1.1, Apache 2.0 Future License

## Abbreviation

FSL-1.1-Apache-2.0

## Notice

Copyright <Year> <Licensor>

## Terms and Conditions

### Licensor ("We")

The party offering the Software under these Terms and Conditions.

### The Software

The "Software" is each version of the software that we make available under
these Terms and Conditions, as indicated by our inclusion of these Terms and
Conditions with the Software.

### License Grant

Subject to your compliance with this License Grant and the Patents,
Redistribution and Trademark clauses below, we hereby grant you the right to
use, copy, modify, create derivative works, publish, and distribute the
Software for any Permitted Purpose identified below.

### Permitted Purpose

A "Permitted Purpose" is any purpose other than a Competing Use. A
"Competing Use" means making the Software available to others in a
commercial product or service that:

1. substitutes for the Software;

2. substitutes for any other product or service we offer using the Software
   that exists as of the date we make the Software available; or

3. offers the same or substantially similar functionality as the Software.

Permitted Purposes specifically include using the Software:

1. for your internal use and access;

2. for non-commercial education;

3. for non-commercial research; and

4. in connection with professional services that you provide to a Licensee
   using the Software in accordance with these Terms and Conditions.

### Patents

To the extent your use for a Permitted Purpose would necessarily infringe our
patents, the license grant above includes a license under our patents. If you
make a claim against any party that the Software infringes or contributes to
the infringement of any patent, then your patent license to the Software ends
immediately.

### Redistribution

The Terms and Conditions apply to all copies, modifications and derivatives
of the Software.

If you redistribute any copies, modifications or derivatives of the Software,
you must include a copy of or a link to these Terms and Conditions and not
remove any copyright notices provided in or with the Software.

### Disclaimer

THE SOFTWARE IS PROVIDED "AS IS" AND WITHOUT WARRANTIES OF ANY KIND,
INCLUDING WITHOUT LIMITATION WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABILITY, TITLE OR NON-INFRINGEMENT.

IN NO EVENT WILL WE HAVE ANY LIABILITY TO YOU ARISING OUT OF OR RELATED TO
THE SOFTWARE, INCLUDING INDIRECT, SPECIAL, INCIDENTAL OR CONSEQUENTIAL
DAMAGES, EVEN IF WE HAVE BEEN INFORMED OF THEIR POSSIBILITY IN ADVANCE.

### Trademarks

Except for displaying the License Details and identifying us as the origin of
the Software, you have no right under these Terms and Conditions to use our
trademarks, trade names, service marks or product names.

## Grant of Future License

We hereby irrevocably grant you an additional license to use the Software
under the Apache License, Version 2.0 that is effective on the second
anniversary of the date we make the Software available. On or after that
date, you may use the Software under the Apache License, Version 2.0, in
which case the following will apply:

Licensed under the Apache License, Version 2.0 (the "License"); you may not
use this file except in compliance with the License.

You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

See the License for the specific language governing permissions and
limitations under the License.

---

## Notes for repo maintainers

- **`<Change Date>` calculation**: Take the version's release date and add
  exactly two years. Format as ISO-8601 (`YYYY-MM-DD`). The Change Date is
  expressed in the "Grant of Future License" section above as "the second
  anniversary of the date we make the Software available" — the date itself
  is not interpolated into the template text but is implied by the
  Effective Date (which is the release date). Some forks of FSL prefer to
  state the Change Date explicitly; the canonical Sentry template uses
  "second anniversary" wording. We follow Sentry's canonical wording.

- **Per-release scheme**: Each new published version of a package gets a
  fresh `LICENSE` file with the release year and (implicitly) the release
  date as its Effective Date. Do not carry a single LICENSE file across
  versions with a single global Change Date.

- **Apache 2 conversion**: After the Change Date passes, downstream
  consumers can use that specific version under Apache 2 by their own
  election. Lloyal Labs does not need to take any action at the Change
  Date — the conversion is automatic per the irrevocable grant above.

- Source: this is the standard FSL-1.1-Apache-2.0 template published by
  Sentry at https://github.com/getsentry/fsl.software. We use the
  template unmodified — see [the FAQ](./faq) for why we did not add a
  bespoke channel restriction or other modifications.

import {
  SWATCHES,
  TEXT_CONTRAST_MIN,
  TEXT_PAIRS,
  UI_CONTRAST_MIN,
  UI_PAIRS,
  contrastRatio,
  tokenValue,
  type ThemeName,
} from '../design/tokens.ts';
import { Badge } from './components/Badge.tsx';
import { Button } from './components/Button.tsx';
import { Card } from './components/Card.tsx';
import { IconButton } from './components/IconButton.tsx';
import { Input } from './components/Input.tsx';
import { Select } from './components/Select.tsx';
import { Tooltip } from './components/Tooltip.tsx';
import { IconRefresh } from './icons.tsx';

const SPACES = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

function ContrastTable({ theme, title }: { theme: ThemeName; title: string }) {
  const rows = [
    ...TEXT_PAIRS.map((pair) => ({ ...pair, min: TEXT_CONTRAST_MIN })),
    ...UI_PAIRS.map((pair) => ({ ...pair, min: UI_CONTRAST_MIN })),
  ];
  return (
    <>
      <h3>{title}</h3>
      <table className="b360-table">
        <caption className="b360-note">
          Razões dos tokens {title.toLowerCase()}. O teste automático confere os mesmos pares
          contra o CSS. Não é um parecer.
        </caption>
        <thead>
          <tr>
            <th scope="col">Par</th>
            <th scope="col">Razão</th>
            <th scope="col">Mínimo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((pair) => {
            const ratio = contrastRatio(tokenValue(pair.fg, theme), tokenValue(pair.bg, theme));
            return (
              <tr key={`${theme}-${pair.label}`}>
                <td>{pair.label}</td>
                <td className="b360-num">{ratio.toFixed(2)}:1</td>
                <td className="b360-num">{pair.min.toFixed(1)}:1</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export function StyleGuide() {
  return (
    <>
      <h1>Guia de componentes</h1>
      <p className="b360-lede">
        Peças base do B360-AOC com dados sintéticos. Nenhum selo desta página é evidência de
        operação. O exemplar Validado mostra o componente, não um parecer.
      </p>

      <section>
        <h2>Selos de evidência</h2>
        <p className="b360-note">
          Sem variante, o selo é Demo. A palavra vai junto da cor. O furo e o índice SYN marcam a
          etiqueta; não substituem o texto.
        </p>
        <dl className="b360-legend">
          <div>
            <dt>
              <Badge />
            </dt>
            <dd>Demonstração. Não há evidência de operação. É o padrão.</dd>
          </div>
          <div>
            <dt>
              <Badge status="parcial" />
            </dt>
            <dd>Parte do caminho existe. O restante não foi comprovado.</dd>
          </div>
          <div>
            <dt>
              <Badge status="validado" />
            </dt>
            <dd>Reservado a evidência citada. Aqui é só o exemplar do selo.</dd>
          </div>
          <div>
            <dt>
              <Badge status="bloqueado" />
            </dt>
            <dd>Dependência ou autorização ausente.</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>Ações</h2>
        <div className="b360-cluster">
          <Button>Primário</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="quiet">Quieto</Button>
          <Button variant="danger">Perigo</Button>
          <Button disabled>Desabilitado</Button>
          <Button loading>Salvando amostra</Button>
          <Button size="sm" variant="secondary">
            Compacto
          </Button>
        </div>
      </section>

      <section>
        <h2>Botões de ícone</h2>
        <p className="b360-note">O nome acessível do primeiro é “Atualizar amostra”.</p>
        <div className="b360-cluster">
          <IconButton label="Atualizar amostra">
            <IconRefresh />
          </IconButton>
          <IconButton label="Ação secundária da amostra" variant="secondary">
            <IconRefresh />
          </IconButton>
          <IconButton label="Ação quieta da amostra" variant="quiet">
            <IconRefresh />
          </IconButton>
        </div>
      </section>

      <section>
        <h2>Campos</h2>
        <p className="b360-note">O formulário não envia nada e não grava persistência.</p>
        <form
          className="b360-form"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <Input
            label="Identificador da amostra"
            name="identificador"
            placeholder="SYN-014"
            hint="Dado sintético. Não consulta o banco."
            autoComplete="off"
            defaultValue="SYN-014"
          />
          <Input
            label="Identificador recusado"
            name="identificador-recusado"
            defaultValue="turno-14"
            error="O identificador da amostra precisa do formato SYN-000."
            autoComplete="off"
          />
          <Select
            label="Estado declarado"
            name="estado"
            defaultValue="demo"
            hint="A escolha não altera o selo real de nenhum módulo."
            options={[
              { value: 'demo', label: 'Demo' },
              { value: 'parcial', label: 'Parcial' },
              { value: 'validado', label: 'Validado (só exemplar)' },
              { value: 'bloqueado', label: 'Bloqueado' },
            ]}
          />
          <Button type="submit">Registrar amostra</Button>
        </form>
      </section>

      <section>
        <h2>Dica</h2>
        <p className="b360-note">Foco ou ponteiro abre. Esc fecha.</p>
        <Tooltip content="Texto de amostra. Não descreve um sistema real.">
          {(props) => <Button {...props}>Ver a dica</Button>}
        </Tooltip>
      </section>

      <section>
        <h2>Cartão</h2>
        <Card
          title="Turno sintético 14"
          footer={<Badge />}
        >
          Fila de revisão da amostra SQ-AUDITORIA-LOCAL. Nenhum item desta fila foi validado.
        </Card>
      </section>

      <section>
        <h2>Tipo</h2>
        <p className="b360-type-sample" data-size="2xl">
          Folha de montagem
        </p>
        <p className="b360-type-sample" data-size="xl">
          Selos de evidência
        </p>
        <p className="b360-type-sample" data-size="lg">
          O selo padrão é Demo.
        </p>
        <p className="b360-type-sample">
          Corpo de leitura para a pessoa que opera ou audita, em uma medida de 68 caracteres.
        </p>
        <p className="b360-type-sample" data-size="sm">
          Nota auxiliar. Continua no contraste de texto pequeno.
        </p>
        <p className="b360-num">SYN-014 · --b360-ink</p>
      </section>

      <section>
        <h2>Espaço</h2>
        <ul className="b360-space-list">
          {SPACES.map((step) => (
            <li key={step}>
              <span className="b360-num">space-{step}</span>
              <span className="b360-space-bar" style={{ width: `var(--b360-space-${step})` }} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Cor</h2>
        <p className="b360-note">Amostra do tema ativo. A barra Tema troca a folha inteira.</p>
        <ul className="b360-swatches">
          {SWATCHES.map((swatch) => (
            <li key={swatch.name} className="b360-swatch">
              <i aria-hidden="true" style={{ background: `var(${swatch.name})` }} />
              <span>
                {swatch.label}
                <br />
                {swatch.name}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Movimento</h2>
        <p className="b360-note">
          A troca de tema usa 200ms na curva de saída. O hover de botão usa 140ms. Com
          prefers-reduced-motion, duração e deslocamento saem de cena. O conteúdo já nasce
          visível.
        </p>
        <p className="b360-num">140ms · 200ms · 320ms</p>
      </section>

      <section>
        <h2>Contraste medido</h2>
        <ContrastTable theme="light" title="Tema claro" />
        <ContrastTable theme="dark" title="Tema escuro" />
      </section>
    </>
  );
}

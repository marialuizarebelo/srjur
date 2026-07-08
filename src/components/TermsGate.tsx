import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'

// Sobe a versão sempre que o texto dos Termos mudar de forma relevante —
// isso faz todo mundo precisar aceitar de novo, mesmo quem já tinha aceitado
// uma versão anterior.
const TERMS_VERSION = '2026-07-v1'

const TERMS_TEXT = `TERMOS DE USO – PLATAFORMA SRJUR

O presente instrumento disciplina os termos e condições de uso da plataforma "SRJUR" ("Sistema"), de propriedade de MARIA LUIZA PADILHA REBELO, inscrita no CNPJ 57.409.676/0001-50, com endereço profissional à Rua Mostardeiro, 366, conj. 501, bairro Moinhos de Vento, Porto Alegre/RS, CEP 90430-001 ("CONTRATADA"), e a pessoa física ou jurídica que acessa e utiliza o Sistema ("USUÁRIO"), doravante em conjunto denominadas "PARTES".

Estes Termos são firmados eletronicamente em conjunto com o contrato de prestação de serviços, mediante assinatura eletrônica da CONTRATANTE via plataforma de assinatura digital (ZapSign ou tecnologia congênere). Para os demais usuários por ela autorizados a acessar o Sistema (equipe, colaboradores e prepostos), o aceite eletrônico realizado no momento do cadastro, login ou uso do Sistema vincula tais usuários à integralidade destas disposições, independentemente de assinatura individual, sendo o respectivo log de aceite armazenado pela CONTRATADA.

Estes Termos aplicam-se a todo usuário que acessa o Sistema, inclusive membros de equipe autorizados pelo escritório contratante, ainda que não signatários de eventual contrato de prestação de serviços firmado com a CONTRATADA. Em caso de conflito entre estes Termos e o contrato individual eventualmente firmado, prevalecerá o contrato individual naquilo que dispuser de forma específica.

CLÁUSULA PRIMEIRA – DO OBJETO

1.1. O presente instrumento regula o licenciamento de uso do Sistema SRJUR, plataforma de gestão para escritórios de advocacia, incluindo funcionalidades de cadastro de clientes, processos, tarefas, financeiro, captura de intimações e publicações processuais, e integrações com plataformas de terceiros.

CLÁUSULA SEGUNDA – DO CADASTRO E DAS CREDENCIAIS DE ACESSO

2.1. O acesso ao Sistema é realizado mediante login e senha pessoais e intransferíveis, sendo de responsabilidade exclusiva do USUÁRIO a veracidade e atualização dos dados cadastrais informados.

2.2. É dever do USUÁRIO: a) manter sigilo absoluto sobre suas credenciais de acesso, sendo vedado o compartilhamento com terceiros alheios à sua equipe autorizada; b) realizar a troca periódica de senha, com periodicidade mínima mensal; c) utilizar, sempre que disponível, mecanismos de autenticação em duas etapas (2FA/MFA); d) comunicar imediatamente à CONTRATADA qualquer suspeita de acesso não autorizado, vazamento de credenciais ou uso indevido do Sistema.

2.3. O descumprimento das obrigações previstas no item 2.2 exime a CONTRATADA de qualquer responsabilidade por danos, perdas de dados, acessos indevidos ou prejuízos de qualquer natureza decorrentes de mau uso, negligência ou compartilhamento de credenciais.

CLÁUSULA TERCEIRA – DO USO PERMITIDO E DAS VEDAÇÕES

3.1. O USUÁRIO compromete-se a utilizar o Sistema exclusivamente para os fins a que se destina, em conformidade com a lei e com estes Termos.

3.2. É vedado ao USUÁRIO: a) ceder, sublicenciar, comercializar ou repassar o acesso ao Sistema a terceiros sem prévia e expressa autorização da CONTRATADA; b) realizar engenharia reversa, descompilar, decompor ou tentar extrair o código-fonte do Sistema; c) utilizar o Sistema para fins ilícitos, fraudulentos ou que violem direitos de terceiros; d) acessar ou tentar acessar áreas, dados ou funcionalidades não autorizadas do Sistema.

CLÁUSULA QUARTA – DA CAPTURA DE INTIMAÇÕES E PUBLICAÇÕES PROCESSUAIS

4.1. O Sistema poderá disponibilizar funcionalidade de captura automatizada de intimações, publicações e andamentos processuais junto a sistemas de terceiros, tais como e-Proc, DJEN (Diário de Justiça Eletrônico Nacional) e demais diários e sistemas processuais eletrônicos, operando com base nos formatos, layouts e disponibilidade de tais plataformas, os quais estão fora do controle da CONTRATADA.

4.2. A funcionalidade de captura constitui mera ferramenta de auxílio e facilitação da rotina do USUÁRIO, não substituindo o acompanhamento processual direto e pessoal, tampouco configurando garantia de recebimento, captura ou entrega de qualquer intimação, publicação ou prazo processual.

4.3. O USUÁRIO declara ciência de que, na qualidade de profissional do Direito, é o único responsável pelo controle e acompanhamento de prazos processuais, comprometendo-se a: a) não utilizar o Sistema como fonte exclusiva de controle de intimações e prazos; b) realizar conferência manual e direta junto aos sistemas oficiais dos Tribunais e Diários de Justiça, no mínimo, uma vez por semana; c) adotar as demais cautelas ordinariamente exigíveis do exercício da advocacia quanto ao controle de prazos.

CLÁUSULA QUINTA – DAS INTEGRAÇÕES COM PLATAFORMAS DE TERCEIROS

5.1. O Sistema poderá disponibilizar integração com plataformas de terceiros, incluindo, mas não se limitando a, Google Drive, Asaas, ZapSign e Google Agenda, com a finalidade de ampliar as funcionalidades disponíveis ao USUÁRIO.

5.2. As integrações mencionadas no item 5.1 dependem do funcionamento, da disponibilidade e das condições de uso próprias de cada plataforma terceira, não se responsabilizando a CONTRATADA por falhas, indisponibilidades, alterações ou descontinuidades de tais serviços, tampouco pelo conteúdo, tratamento de dados ou eventuais perdas de informação ocorridas no âmbito das plataformas integradas, uma vez ativada a integração pelo USUÁRIO.

5.3. A CONTRATADA atua exclusivamente como fornecedora da ferramenta tecnológica, não se responsabilizando por atos, omissões, tratamento de dados ou eventuais falhas praticadas pelas plataformas de terceiros integradas ao Sistema.

CLÁUSULA SEXTA – DA PROPRIEDADE INTELECTUAL E DOS DADOS

6.1. O Sistema, seu código-fonte, layout, lógica de funcionamento e demais elementos de propriedade intelectual pertencem exclusivamente à CONTRATADA, não conferindo estes Termos ao USUÁRIO qualquer direito sobre tais elementos além do licenciamento de uso aqui previsto.

6.2. Os dados inseridos pelo USUÁRIO no Sistema (cadastro de clientes, processos, tarefas e demais informações) pertencem ao USUÁRIO, que poderá solicitar sua exportação a qualquer tempo, observados os prazos operacionais razoáveis para atendimento da solicitação.

CLÁUSULA SÉTIMA – DA DISPONIBILIDADE DO SISTEMA

7.1. A CONTRATADA envidar os melhores esforços para manter o Sistema disponível de forma contínua, sem, contudo, garantir disponibilidade ininterrupta, estando o Sistema sujeito a interrupções decorrentes de manutenção programada, atualizações, instabilidades de conexão à internet, de infraestrutura de telecomunicações ou de provedores de hospedagem de terceiros.

7.2. A CONTRATADA não se responsabiliza por falhas decorrentes de caso fortuito ou força maior, nos termos do art. 393 do Código Civil.

CLÁUSULA OITAVA – DA LIMITAÇÃO DE RESPONSABILIDADE

8.1. O Sistema constitui ferramenta de apoio e facilitação da gestão do escritório do USUÁRIO, não configurando prestação de serviços advocatícios ou consultoria jurídica individualizada, tampouco substituindo o julgamento técnico-profissional do USUÁRIO.

8.2. A CONTRATADA não se responsabiliza por danos indiretos, lucros cessantes, perda de chance ou interrupção de atividades decorrentes do uso ou da impossibilidade de uso do Sistema, nem por quaisquer decisões, ações, omissões ou comunicações do USUÁRIO perante terceiros que tenham por base informações extraídas do Sistema, sendo de sua exclusiva responsabilidade a conferência e validação de tais informações junto às respectivas fontes primárias antes de qualquer uso que produza efeitos perante terceiros.

8.3. Eventual responsabilização da CONTRATADA por falha comprovadamente imputável à estruturação ou manutenção do Sistema restringir-se-á a danos diretos e materiais, ficando limitada, em qualquer hipótese, ao valor total pago pelo USUÁRIO nos 12 (doze) meses imediatamente anteriores ao evento danoso.

CLÁUSULA NONA – DO TRATAMENTO DE DADOS PESSOAIS (LGPD)

9.1. Para fins destes Termos, as PARTES reconhecem que o USUÁRIO atua como Controlador dos dados pessoais de seus clientes, colaboradores e demais pessoas cujos dados sejam inseridos no Sistema, e que a CONTRATADA atua como Operadoras, nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais – LGPD).

9.2. A CONTRATADA tratará os dados pessoais acessados em razão da prestação dos serviços exclusivamente conforme as instruções do USUÁRIO, adotando medidas técnicas e administrativas aptas a proteger tais dados de acessos não autorizados e de situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou difusão.

9.3. Em caso de incidente de segurança que possa acarretar risco ou dano relevante ao USUÁRIO ou aos titulares dos dados, a CONTRATADA comunicará o USUÁRIO em prazo razoável, conforme exigido pelo art. 48 da LGPD.

9.4. O USUÁRIO, na qualidade de Controlador, é o responsável pela legalidade do tratamento de dados que instrui, devendo garantir que a coleta e o envio de dados pessoais ao Sistema estão amparados em base legal adequada nos termos da LGPD.

CLÁUSULA DÉCIMA – DA RESCISÃO E DO BLOQUEIO DE ACESSO

10.1. O acesso do USUÁRIO ao Sistema poderá ser bloqueado pela CONTRATADA em caso de inadimplemento contratual, descumprimento destes Termos, ou ao término da vigência do contrato de prestação de serviços eventualmente firmado, sem que isso caracterize inadimplemento por parte da CONTRATADA.

10.2. Encerrado o vínculo contratual, o USUÁRIO poderá solicitar a exportação de seus dados no prazo de até 30 (trinta) dias, findo o qual a CONTRATADA poderão proceder à exclusão dos dados armazenados, ressalvadas as hipóteses de retenção obrigatória por força de lei.

CLÁUSULA DÉCIMA PRIMEIRA – DAS ALTERAÇÕES DESTES TERMOS

11.1. A CONTRATADA poderá atualizar estes Termos a qualquer tempo, mediante comunicação prévia ao USUÁRIO com antecedência mínima de 15 (quinze) dias, permanecendo a versão anterior acessível para consulta.

11.2. A permanência do USUÁRIO no uso do Sistema após a entrada em vigor das alterações implica concordância com os novos termos.

CLÁUSULA DÉCIMA SEGUNDA – DO FORO

12.1. Fica eleito o foro da Comarca de Porto Alegre/RS para dirimir quaisquer controvérsias oriundas destes Termos.`

export function TermsGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const [checked, setChecked] = useState(false)
  const [needsAccept, setNeedsAccept] = useState(false)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (loading || !user) return
    supabase.from('terms_acceptances')
      .select('id').eq('user_id', user.id).eq('terms_version', TERMS_VERSION).maybeSingle()
      .then(({ data }) => {
        setNeedsAccept(!data)
        setChecked(true)
      })
  }, [loading, user])

  async function handleAccept() {
    if (!user) return
    setAccepting(true)
    const { error } = await supabase.from('terms_acceptances').insert({
      user_id: user.id,
      terms_version: TERMS_VERSION,
      user_agent: navigator.userAgent,
    })
    setAccepting(false)
    if (error) return
    setNeedsAccept(false)
  }

  if (loading || !user || !checked || !needsAccept) return <>{children}</>

  return (
    <div className="fixed inset-0 z-[999] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Termos de Uso</h2>
          <p className="text-sm text-muted-foreground mt-1">Antes de continuar, leia e aceite os termos de uso da plataforma.</p>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground/90">{TERMS_TEXT}</pre>
        </div>
        <div className="p-6 border-t flex justify-end">
          <Button onClick={handleAccept} disabled={accepting}>
            {accepting ? 'Registrando...' : 'Li e aceito os Termos de Uso'}
          </Button>
        </div>
      </div>
    </div>
  )
}
